import { useState, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import LogObstacle from './LogObstacle'
import Player from './Player'
import CameraControl from './CameraControl'
import { usePose } from '../hooks/usePose'
import { useJumpDetection } from '../hooks/useJumpDetection'

// PRIVACY: Camera processing is in-memory only. Video is hidden and processed
// frame-by-frame for pose detection. No frames, images, or pose data are saved
// or stored anywhere. All data is discarded immediately after processing.

// Game constants - easy to tune difficulty
const BASE_LOG_SPEED = 0.12 // Centralized log speed (increased from 0.075)
const MIN_LOG_SPACING = 1800 // Minimum time between logs (ms) - prevents overlap
const MAX_LOG_SPACING = 3000 // Maximum time between logs (ms) - adds variation
const FIRST_LOG_DELAY = 500 // Delay before first log appears (reduced from 2000 - almost immediate)
const LOG_DESPAWN_DISTANCE = 15 // Distance behind player before log despawns (increased from ~1)
const MIN_LOG_DISTANCE_Z = 8 // Minimum distance along Z axis between logs (prevents clumping)

function RunnerScene({ calibrationData, customization, debugMode = false, cameraEnabled = false }) {
  const videoRef = useRef(null)
  const playerPositionRef = useRef([0, 0, 0])
  const [obstacles, setObstacles] = useState([])
  const [gameSpeed, setGameSpeed] = useState(0)
  const [stream, setStream] = useState(null)
  const [gameOver, setGameOver] = useState(false)
  const [score, setScore] = useState(0)
  const [gameKey, setGameKey] = useState(0)
  const [hearts, setHearts] = useState(3) // Lives system: start with 3 hearts
  const [playerState, setPlayerState] = useState('running') // State machine: 'running' | 'tumbling' | 'gameOver'
  const [isPaused, setIsPaused] = useState(false)
  const [unpauseCountdown, setUnpauseCountdown] = useState(0) // Countdown before unpausing (0 = no countdown)
  const isPausedRef = useRef(false) // Track latest isPaused for game loop
  const scoredObstaclesRef = useRef(new Set())
  const hitObstaclesRef = useRef(new Set()) // Track obstacles that have already hit the player
  const gameSpeedRef = useRef(0) // Track latest gameSpeed for spawn checks
  const gameOverRef = useRef(false) // Track latest gameOver for spawn checks
  const heartsRef = useRef(3) // Track latest hearts value for tumble cleanup
  const playerStateRef = useRef('running') // Track latest playerState for tumble speed calculation
  const wasCollidingRef = useRef(false) // Track if player was colliding in previous frame (edge detection)
  
  // Tumble timer pause-aware tracking
  const tumbleStartTimeRef = useRef(null) // When tumble started (timestamp)
  const pausedStartTimeRef = useRef(null) // When pause started during tumble (null if not paused)
  const pausedAccumulatedTimeRef = useRef(0) // Total paused time accumulated during this tumble (ms)
  const tumbleTimerIntervalRef = useRef(null) // Reference to the interval checking tumble duration
  
  // Invincibility timer - simple countdown that freezes when paused (by virtue of pause check at top of loop)
  const invincibilityTimerRef = useRef(0) // Remaining invincibility time in ms (0 = not invincible)
  const lastInvincibilityUpdateRef = useRef(null) // Timestamp of last timer update (for accurate elapsed time calculation)
  
  // Single deterministic spawn loop tracking
  const nextSpawnTimeRef = useRef(null) // Time (ms) when next log should spawn
  const lastSpawnTimeRef = useRef(0) // Time (ms) when last log spawned
  const spawnLoopActiveRef = useRef(false) // Flag to ensure only one spawn loop
  
  // DEBUG MODE: Spacebar jump detection
  const [debugJumping, setDebugJumping] = useState(false)
  
  // Keep refs in sync with state
  useEffect(() => {
    gameSpeedRef.current = gameSpeed
  }, [gameSpeed])
  
  useEffect(() => {
    gameOverRef.current = gameOver
  }, [gameOver])
  
  useEffect(() => {
    heartsRef.current = hearts // Keep hearts ref in sync
  }, [hearts])
  
  useEffect(() => {
    playerStateRef.current = playerState // Keep playerState ref in sync for tumble speed
  }, [playerState])
  
  useEffect(() => {
    isPausedRef.current = isPaused // Keep isPaused ref in sync
    
    // Reset invincibility timer timestamp when unpausing (prevents including paused time in elapsed calculation)
    if (!isPaused && invincibilityTimerRef.current > 0 && lastInvincibilityUpdateRef.current !== null) {
      lastInvincibilityUpdateRef.current = Date.now()
    }
  }, [isPaused])
  
  // Auto-pause when tab becomes hidden (visibility change)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsPaused(true)
        setUnpauseCountdown(0) // Clear any active countdown
        console.log("Auto-paused because tab is hidden")
      }
      // When tab becomes visible, do nothing - player must press Resume manually
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [setIsPaused])
  
  // Countdown timer effect - handles 3→2→1 countdown before unpausing
  useEffect(() => {
    if (unpauseCountdown <= 0) {
      return // No countdown active
    }
    
    // Start 1-second timeout to decrement countdown
    const timer = setTimeout(() => {
      if (unpauseCountdown === 1) {
        // Countdown finished - actually unpause the game
        setIsPaused(false)
        setUnpauseCountdown(0)
      } else {
        // Decrement countdown
        setUnpauseCountdown(prev => prev - 1)
      }
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [unpauseCountdown, setIsPaused])
  
  // Helper function to award score for a log (single point of score increase)
  function awardScoreForObstacle(id) {
    // If this log ever hit the player, it should NEVER give score.
    if (hitObstaclesRef.current.has(id)) return

    // If it already gave score once, don't give it again.
    if (scoredObstaclesRef.current.has(id)) return

    // Mark as scored and set score based on how many clean logs we've scored so far.
    scoredObstaclesRef.current.add(id)
    setScore(scoredObstaclesRef.current.size)
  }

  // Reset spawn tracking when starting a new run
  const resetSpawnTracking = () => {
    const now = Date.now()
    lastSpawnTimeRef.current = now - MIN_LOG_SPACING // Allow first spawn after FIRST_LOG_DELAY
    nextSpawnTimeRef.current = now + FIRST_LOG_DELAY // First spawn time
    spawnLoopActiveRef.current = false // Mark loop as inactive so it can start fresh
  }

  // Reset game function - restarts game without going back to calibration
  const resetGame = () => {
    // CRITICAL: Clear obstacles FIRST to ensure no logs linger from previous run
    setObstacles([])
    // Stop spawn loop to prevent duplicate intervals
    spawnLoopActiveRef.current = false
    // Reset scoring: clear refs and score
    hitObstaclesRef.current.clear()
    scoredObstaclesRef.current.clear()
    setScore(0)
    setGameOver(false)
    setHearts(3) // Reset hearts to 3
    heartsRef.current = 3 // Reset hearts ref
    setPlayerState('running') // Reset to running state
    setGameKey(prev => prev + 1) // Force re-render with new key
    playerPositionRef.current = [0, 0.5, 26] // Reset player position (z=26)
    wasCollidingRef.current = false // Reset collision state for edge detection
    invincibilityTimerRef.current = 0 // Reset invincibility timer
    lastInvincibilityUpdateRef.current = null // Reset invincibility update timestamp
    resetSpawnTracking() // Reset spawn tracking for new run
    // Manually restart game speed after reset (since isLoading won't change)
    setGameSpeed(BASE_LOG_SPEED)
  }
  
  // Tumble state handler - enters tumble state after hit, exits after duration
  // Pause-aware: timer only counts down when game is not paused
  useEffect(() => {
    if (playerState === 'tumbling') {
      const tumbleDuration = 1500 // 1500ms of tumble (reduced from 3000)
      
      // Initialize tumble tracking
      const startTime = Date.now()
      tumbleStartTimeRef.current = startTime
      pausedAccumulatedTimeRef.current = 0
      // If already paused when tumble starts, record pause start time immediately
      pausedStartTimeRef.current = isPausedRef.current ? startTime : null
      
      // Check tumble duration periodically (every 50ms for responsiveness)
      const checkTumbleDuration = () => {
        // Pause check: stop timer progression when paused
        if (isPausedRef.current) {
          return // Timer is frozen, don't check duration
        }
        
        const now = Date.now()
        const elapsedTime = now - startTime
        const activeTime = elapsedTime - pausedAccumulatedTimeRef.current
        
        // Only end tumble when active (non-paused) time exceeds duration
        if (activeTime >= tumbleDuration) {
          setPlayerState('running') // Return to running after tumble
          // Reset collision state so player can be hit again after separating from logs
          // NOTE: Do NOT clear hitObstaclesRef here - hit obstacles must persist so they never award score
          wasCollidingRef.current = false
          // Clean up
          if (tumbleTimerIntervalRef.current) {
            clearInterval(tumbleTimerIntervalRef.current)
            tumbleTimerIntervalRef.current = null
          }
        }
      }
      
      // Start checking every 50ms
      tumbleTimerIntervalRef.current = setInterval(checkTumbleDuration, 50)
      
      return () => {
        if (tumbleTimerIntervalRef.current) {
          clearInterval(tumbleTimerIntervalRef.current)
          tumbleTimerIntervalRef.current = null
        }
      }
    } else {
      // Not tumbling - clean up any running timer
      if (tumbleTimerIntervalRef.current) {
        clearInterval(tumbleTimerIntervalRef.current)
        tumbleTimerIntervalRef.current = null
      }
      // Reset tracking
      tumbleStartTimeRef.current = null
      pausedAccumulatedTimeRef.current = 0
      pausedStartTimeRef.current = null
    }
  }, [playerState])
  
  // Track pause state changes during tumble to accumulate paused time
  useEffect(() => {
    if (playerState !== 'tumbling') {
      pausedStartTimeRef.current = null
      return
    }
    
    if (isPaused && pausedStartTimeRef.current === null) {
      // Just entered pause during tumble - record pause start time
      pausedStartTimeRef.current = Date.now()
    } else if (!isPaused && pausedStartTimeRef.current !== null) {
      // Just exited pause during tumble - accumulate paused duration
      const pauseDuration = Date.now() - pausedStartTimeRef.current
      pausedAccumulatedTimeRef.current += pauseDuration
      pausedStartTimeRef.current = null
    }
  }, [isPaused, playerState])

  const { poses, isLoading } = usePose(videoRef, cameraEnabled && !debugMode)
  const { isJumping: poseJumping } = useJumpDetection(
    poses, 
    calibrationData?.baselineHipHeight ?? null
  )
  
  // DEBUG MODE: Use Up Arrow instead of pose detection (or if camera is disabled)
  const rawIsJumping = (debugMode || !cameraEnabled) ? debugJumping : poseJumping
  // Allow jumping during running and tumbling states (block during game over)
  const isJumping = (playerState === 'running' || playerState === 'tumbling') ? rawIsJumping : false
  
  // DEBUG MODE: Up Arrow keyboard listener
  useEffect(() => {
    if (!debugMode) return
    
    const handleKeyDown = (e) => {
      if (e.code === 'ArrowUp' && !gameOver) {
        e.preventDefault()
        setDebugJumping(true)
      }
    }
    
    const handleKeyUp = (e) => {
      if (e.code === 'ArrowUp') {
        e.preventDefault()
        setDebugJumping(false)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [debugMode, gameOver])

  // Start/stop webcam for game (skip in DEBUG MODE or if camera is disabled)
  // Use ref to track stream to avoid dependency loop
  const streamRef = useRef(null)
  
  useEffect(() => {
    // Store stream in ref for cleanup
    streamRef.current = stream
  }, [stream])
  
  useEffect(() => {
    if (debugMode || !cameraEnabled) {
      // DEBUG MODE or camera OFF: Stop all tracks and clear video
      const currentStream = streamRef.current
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop())
        setStream(null)
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      return
    }
    
    // Prevent multiple starts - check if stream already exists
    if (streamRef.current) {
      return // Already have a stream, don't start again
    }
    
    // Camera is ON and not in debug mode - start webcam (only once)
    async function startWebcam() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: 640, height: 480 } 
        })
        
        // Check if camera was disabled while waiting for permission
        if (debugMode || !cameraEnabled || streamRef.current) {
          mediaStream.getTracks().forEach(track => track.stop())
          return
        }
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
          streamRef.current = mediaStream
          setStream(mediaStream)
          
          // Wait for video to be ready before pose detection starts
          videoRef.current.onloadedmetadata = () => {
            // Force video to play to ensure frames are available
            videoRef.current.play().catch(err => {
              console.error('Error playing video:', err)
            })
          }
          
          // Also try to play immediately
          videoRef.current.play().catch(err => {
            console.error('Error playing video:', err)
          })
        }
      } catch (error) {
        console.error('Error accessing webcam:', error)
        streamRef.current = null
      }
    }
    startWebcam()

    return () => {
      // Cleanup: stop all tracks when component unmounts or camera is toggled off
      const currentStream = streamRef.current
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }
  }, [debugMode, cameraEnabled]) // Removed stream from dependencies to prevent loop

  // Handle tab visibility changes - adjust spawn timing when tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab became hidden - pause spawn tracking (loop will stop naturally)
        spawnLoopActiveRef.current = false
      } else if (gameSpeedRef.current > 0 && !gameOverRef.current) {
        // Tab became visible - resume spawn tracking
        resetSpawnTracking()
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Start game
  useEffect(() => {
    // DEBUG MODE or camera OFF: Skip pose loading check, start immediately
    if (debugMode || !cameraEnabled || !isLoading) {
      setGameSpeed(BASE_LOG_SPEED) // Use centralized log speed constant
      resetSpawnTracking() // Initialize spawn tracking when game starts
    }
  }, [isLoading, debugMode, cameraEnabled])

  // Get player position for collision detection
  const updatePlayerPosition = (pos) => {
    playerPositionRef.current = pos
  }

  // Move obstacles, check collisions, and spawn logs (single deterministic loop)
  useEffect(() => {
    if (gameSpeed === 0 || gameOver) {
      spawnLoopActiveRef.current = false // Stop spawn loop
      return
    }
    
    // Safety check: ensure only one spawn loop is active
    if (spawnLoopActiveRef.current) {
      // Loop already active, reset and start fresh
      resetSpawnTracking()
    }
    spawnLoopActiveRef.current = true

    const moveInterval = setInterval(() => {
      // Pause check: stop all game updates if paused
      if (isPausedRef.current) {
        return
      }
      
      // Decrement invincibility timer (only when not paused - timer freezes during pause)
      const now = Date.now()
      if (invincibilityTimerRef.current > 0) {
        if (lastInvincibilityUpdateRef.current === null) {
          lastInvincibilityUpdateRef.current = now
        } else {
          const elapsed = now - lastInvincibilityUpdateRef.current
          invincibilityTimerRef.current = Math.max(0, invincibilityTimerRef.current - elapsed)
          lastInvincibilityUpdateRef.current = now
        }
      } else {
        lastInvincibilityUpdateRef.current = null
      }
      
      // Safety check: stop if game ended or speed is 0
      if (gameSpeedRef.current === 0 || gameOverRef.current) {
        spawnLoopActiveRef.current = false
        return
      }
      
      // Spawn logic: check if it's time to spawn a new log
      if (nextSpawnTimeRef.current !== null && now >= nextSpawnTimeRef.current) {
        // Calculate time since last spawn for spacing enforcement
        const timeSinceLastSpawn = now - lastSpawnTimeRef.current
        
        // Enforce minimum spacing
        if (timeSinceLastSpawn >= MIN_LOG_SPACING) {
          // Check if there's already a log too close to spawn position
          const spawnZ = -25
          const minLogDistance = 3 // Minimum distance between logs (prevent overlap)
          
          // Check existing obstacles before spawning (prevent overlap)
          // Access current obstacles to check for overlap
          setObstacles(prev => {
            // Find the last (furthest back) obstacle to check spacing
            const lastObstacle = prev.length > 0 ? prev.reduce((last, obs) => 
              obs.z < last.z ? obs : last
            ) : null
            
            // If there's a last obstacle, check distance along Z axis
            if (lastObstacle !== null) {
              const zDistance = Math.abs(spawnZ - lastObstacle.z)
              if (zDistance < MIN_LOG_DISTANCE_Z) {
                // Too close to last obstacle, skip spawning this tick
                return prev
              }
            }
            
            // Spawn a new log only if spacing is OK
            return [...prev, {
              id: Date.now(),
              z: spawnZ, // Spawn much further back so player has more reaction time
              x: 0, // Single lane
              hasHitPlayer: false, // Track if this log has hit the player (prevents scoring)
              hasPassedPlayer: false // Track if this log has passed the player (for scoring)
            }]
          })
          
          // Update spawn time after spawn attempt (whether successful or not)
          // This prevents rapid retries and ensures proper spacing
          lastSpawnTimeRef.current = now
          // Calculate next spawn time with random spacing (MIN to MAX)
          const nextSpawnGap = MIN_LOG_SPACING + Math.random() * (MAX_LOG_SPACING - MIN_LOG_SPACING)
          nextSpawnTimeRef.current = now + nextSpawnGap
        } else {
          // Not enough time passed, schedule spawn after minimum spacing
          nextSpawnTimeRef.current = lastSpawnTimeRef.current + MIN_LOG_SPACING
        }
      }
      
      setObstacles(prev => {
        // Calculate effective game speed - slower during tumble (logs move slower)
        // Use ref to get current playerState (avoids stale closure)
        const effectiveSpeed = playerStateRef.current === 'tumbling' ? gameSpeed * 0.4 : gameSpeed
        
        // Edge-detection based collision: only trigger on collision ENTER, not while overlapping
        let isCurrentlyColliding = false
        let collisionObsId = null
        
        // CRITICAL: Check playerState BEFORE processing collisions to prevent double-hits
        // If we're in tumble, skip all collision processing (player is invincible during tumble)
        const isInTumble = playerStateRef.current === 'tumbling'
        
        // Get player position for collision detection and scoring
        const playerZ = playerPositionRef.current[2] || 26
        
        const updated = prev.map(obs => {
          const newZ = obs.z + effectiveSpeed // Use effective speed (slower during tumble)
          
          // Check if obstacle has passed player (for scoring)
          const hasPassed = newZ > playerZ
          const newHasPassed = hasPassed || obs.hasPassedPlayer || false
          
          // Collision detection
          // Player: x=0±0.5, y varies (0 when grounded, up to ~1.5 when jumping), z=0
          // Obstacle: x=0±1, y=0.5 (height 1, positioned at 0.5), z=newZ
          const playerPos = playerPositionRef.current
          const playerX = playerPos[0]
          const playerY = playerPos[1] // Height above ground
          
          // Check X overlap (lateral collision) - log is wider now (radius 1.5)
          const xOverlap = Math.abs(obs.x - playerX) < 1.8
          // Check Z overlap (depth collision) - obstacle is approaching from negative z
          // Log is shallower now (height 1.5, rotated), adjust collision zone
          // Player is at z=26, so check overlap relative to that
          const zOverlap = newZ > 24.5 && newZ < 27.0
          // Check Y overlap (vertical) - player must be low enough to hit obstacle
          // Log is at y=0.5, height 1.5 (diameter), but rotated so it's a cylinder lying flat
          // Log top is roughly at y=1.25 (0.5 + radius 0.75), player is safe if y > 1.3
          const yCollision = playerY < 1.3
          
          // Check if currently colliding with this obstacle
          if (xOverlap && zOverlap && yCollision) {
            isCurrentlyColliding = true
            // Track the first colliding obstacle ID for hit processing
            if (collisionObsId === null) {
              collisionObsId = obs.id
            }
            // Mark ALL overlapping obstacles as hit to prevent processing them again
            hitObstaclesRef.current.add(obs.id)
          }
          
          return { 
            ...obs, 
            z: newZ,
            hasPassedPlayer: newHasPassed // Track if this log has ever passed the player
          }
        })
        
        // EDGE DETECTION: Only trigger hit on collision ENTER (was NOT colliding, now IS colliding)
        // This prevents multiple hearts lost from the same log as player stays overlapping
        const collisionEnter = isCurrentlyColliding && !wasCollidingRef.current
        
        // Process collision only on ENTER edge (prevents double hits from same log or overlapping logs)
        // CRITICAL: Double-check we're not in tumble before processing (defense in depth)
        // CRITICAL: Check invincibility timer - prevent damage if still invincible
        if (collisionEnter && collisionObsId !== null && !isInTumble && playerStateRef.current === 'running' && invincibilityTimerRef.current <= 0) {
          // Mark the colliding obstacle as having hit the player (prevents scoring)
          const hitObsIndex = updated.findIndex(obs => obs.id === collisionObsId)
          if (hitObsIndex !== -1) {
            updated[hitObsIndex] = { ...updated[hitObsIndex], hasHitPlayer: true }
            // Add to hitObstaclesRef to prevent scoring (persistent tracking)
            hitObstaclesRef.current.add(collisionObsId)
            
            // DEBUG: Log when hit actually counts
            const hitObs = updated[hitObsIndex]
            const playerZ = playerPositionRef.current[2] || 26
            console.log("HIT", {
              id: hitObs.id,
              playerZ,
              obsZ: hitObs.z,
              inHitSet: hitObstaclesRef.current.has(hitObs.id),
            })
          }
          
          const currentHearts = heartsRef.current
          
          if (currentHearts > 1) {
            // Player has hearts remaining - lose one and enter tumble
            setHearts(prev => prev - 1)
            setPlayerState('tumbling') // Enter tumble state (prevents jumping and further collisions)
            // Start invincibility period (0.75s = 750ms)
            invincibilityTimerRef.current = 750
            lastInvincibilityUpdateRef.current = Date.now()
          } else if (currentHearts === 1) {
            // Last heart - lose it and immediately trigger game over (no tumble)
            setHearts(0)
            setGameOver(true)
            setPlayerState('gameOver')
            // Start invincibility period even on game over (prevent multiple hits in same frame)
            invincibilityTimerRef.current = 750
            lastInvincibilityUpdateRef.current = Date.now()
          } else if (currentHearts === 0) {
            // Safety check: if somehow we hit with 0 hearts, trigger game over
            setGameOver(true)
            setPlayerState('gameOver')
            // No invincibility needed here as game is already over
          }
        }
        
        // Update collision state for next frame (edge detection)
        wasCollidingRef.current = isCurrentlyColliding
        
        // Award score for logs that passed the player cleanly
        // (playerZ is already defined above in this scope)
        updated.forEach(obs => {
          // Check if log has passed the player
          const hasPassedPlayer = obs.z > 26.5
          
          // If log has passed player, award score (helper handles all checks)
          if (hasPassedPlayer) {
            awardScoreForObstacle(obs.id)
          }
        })
        
        // Remove obstacles that passed despawn distance (player is at z=26, despawn at z=26+15=41)
        const despawnZ = playerZ + LOG_DESPAWN_DISTANCE
        const remaining = updated.filter(obs => obs.z <= despawnZ)
        return remaining
      })
    }, 16) // ~60fps

    return () => {
      clearInterval(moveInterval)
      spawnLoopActiveRef.current = false // Mark loop as inactive when cleanup runs
    }
  }, [gameSpeed, gameOver, playerState]) // Include playerState to recalculate effectiveSpeed when tumble state changes

  // Increase difficulty (spawn rate, not speed) - slower increase
  useEffect(() => {
    if (gameOver) return
    
    const maxSpeed = BASE_LOG_SPEED * 1.5 // Cap at 1.5x base speed
    const difficultyInterval = setInterval(() => {
      setGameSpeed(prev => Math.min(prev + 0.001, maxSpeed))
    }, 10000) // Increase every 10 seconds (slower)

    return () => clearInterval(difficultyInterval)
  }, [gameOver])

  return (
    <>
      {/* Hidden video for pose detection - frames processed and immediately discarded */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline
        muted
        style={{ position: 'absolute', top: 0, left: 0, width: 320, height: 240, opacity: 0, pointerEvents: 'none', zIndex: -1 }}
      />
      
      {/* Game Over Overlay */}
      {gameOver && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          zIndex: 1000
        }}>
          <h1 style={{ fontSize: '3em', marginBottom: '20px' }}>Game Over!</h1>
          <p style={{ fontSize: '1.5em', marginBottom: '30px' }}>Score: {score}</p>
          <button 
            onClick={resetGame}
            style={{
              padding: '15px 30px',
              fontSize: '18px',
              cursor: 'pointer',
              background: '#4a7c59',
              color: 'white',
              border: 'none',
              borderRadius: '5px'
            }}
          >
            Play Again
          </button>
        </div>
      )}

      {/* Camera OFF Message */}
      {!cameraEnabled && !debugMode && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#ff6b6b',
          fontSize: '1.5em',
          fontWeight: 'bold',
          zIndex: 1000,
          textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
          background: 'rgba(0,0,0,0.7)',
          padding: '20px',
          borderRadius: '10px',
          textAlign: 'center'
        }}>
          Camera is off. Turn it on to play.
        </div>
      )}
      
      {/* Pause Overlay */}
      {(isPaused || unpauseCountdown > 0) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          pointerEvents: 'none'
        }}>
          <div style={{
            color: 'white',
            fontSize: '4em',
            fontWeight: 'bold',
            textShadow: '3px 3px 6px rgba(0,0,0,0.9)',
            letterSpacing: '0.1em'
          }}>
            {unpauseCountdown > 0 ? `Starting in ${unpauseCountdown}...` : 'PAUSED'}
          </div>
        </div>
      )}
      
      {/* Score Display */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        color: 'white',
        fontSize: '24px',
        fontWeight: 'bold',
        zIndex: 100,
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
      }}>
        Score: {score}
      </div>
      
      {/* Pause/Resume Button */}
      <button
        onClick={() => {
          if (isPaused === false) {
            // Game running - pause immediately
            setIsPaused(true)
            setUnpauseCountdown(0) // Ensure no countdown
            console.log("Paused state: true")
          } else {
            // Game paused - start countdown if not already counting down
            if (unpauseCountdown > 0) {
              return // Ignore extra clicks during countdown
            }
            // Start countdown (game stays paused until countdown finishes)
            setUnpauseCountdown(3)
            console.log("Starting unpause countdown: 3")
          }
        }}
        style={{
          position: 'absolute',
          top: '60px',
          left: '20px',
          padding: '10px 20px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: 'pointer',
          background: '#4a7c59',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          zIndex: 100,
          textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
        }}
      >
        {isPaused ? 'Resume' : 'Pause'}
      </button>
      
      {/* Hearts Display */}
      <div style={{
        position: 'absolute',
        top: '70px',
        right: '20px',
        color: 'white',
        fontSize: '28px',
        fontWeight: 'bold',
        zIndex: 100,
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        display: 'flex',
        gap: '8px',
        alignItems: 'center'
      }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i} style={{ 
            color: i < hearts ? '#ff6b6b' : '#444',
            opacity: i < hearts ? 1 : 0.3,
            transition: 'all 0.3s'
          }}>
            ❤️
          </span>
        ))}
      </div>
      
      <Canvas 
        key={gameKey} 
        camera={{ position: [0, 7.5, 32], fov: 82 }}
        style={{ width: '100vw', height: '100vh', display: 'block' }}
      >
        <CameraControl />
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        
        {/* Sky/Forest background */}
        <mesh position={[0, 5, -20]}>
          <planeGeometry args={[40, 30]} />
          <meshStandardMaterial color="#87CEEB" />
        </mesh>
        
        {/* Trees (simple background elements) */}
        {[-6, -3, 3, 6].map(x => (
          <mesh key={x} position={[x, 4, -15]}>
            <cylinderGeometry args={[0.3, 0.3, 4, 8]} />
            <meshStandardMaterial color="#2d5016" />
          </mesh>
        ))}
        
        {/* Ground - extended length much further */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[20, 500]} />
          <meshStandardMaterial color="#4a7c59" />
        </mesh>

        {/* Player - positioned at z=26 */}
        <Player position={26} isJumping={isJumping} playerState={playerState} customization={customization} onPositionUpdate={updatePlayerPosition} isPaused={isPaused} />

        {/* Obstacles - logs positioned slightly lower to match shallower height */}
        {obstacles.map(obs => (
          <LogObstacle key={obs.id} position={[obs.x, 0.5, obs.z]} />
        ))}
      </Canvas>
    </>
  )
}

export default RunnerScene

