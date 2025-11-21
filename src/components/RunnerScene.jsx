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

function RunnerScene({ calibrationData, customization, debugMode = false }) {
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
  const scoredObstaclesRef = useRef(new Set())
  const hitObstaclesRef = useRef(new Set()) // Track obstacles that have already hit the player
  const gameSpeedRef = useRef(0) // Track latest gameSpeed for spawn checks
  const gameOverRef = useRef(false) // Track latest gameOver for spawn checks
  
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
  
  // Reset spawn tracking when starting a new run
  const resetSpawnTracking = () => {
    const now = Date.now()
    lastSpawnTimeRef.current = now - MIN_LOG_SPACING // Allow first spawn after FIRST_LOG_DELAY
    nextSpawnTimeRef.current = now + FIRST_LOG_DELAY // First spawn time
    spawnLoopActiveRef.current = false // Mark loop as inactive so it can start fresh
  }

  // Reset game function - restarts game without going back to calibration
  const resetGame = () => {
    setObstacles([])
    setScore(0)
    setGameOver(false)
    setHearts(3) // Reset hearts to 3
    setPlayerState('running') // Reset to running state
    setGameKey(prev => prev + 1) // Force re-render with new key
    playerPositionRef.current = [0, 0.5, 26] // Reset player position (z=26)
    scoredObstaclesRef.current.clear() // Reset scored obstacles tracking
    hitObstaclesRef.current.clear() // Reset hit obstacles tracking
    resetSpawnTracking() // Reset spawn tracking for new run
    // Manually restart game speed after reset (since isLoading won't change)
    setGameSpeed(BASE_LOG_SPEED)
  }
  
  // Tumble state handler - enters tumble state after hit, exits after duration
  useEffect(() => {
    if (playerState === 'tumbling') {
      const tumbleDuration = 1500 // 1.5 seconds of tumble
      const tumbleTimer = setTimeout(() => {
        setPlayerState('running') // Return to running after tumble
      }, tumbleDuration)
      
      return () => clearTimeout(tumbleTimer)
    }
  }, [playerState])

  const { poses, isLoading } = usePose(videoRef)
  const { isJumping: poseJumping } = useJumpDetection(
    poses, 
    calibrationData?.baselineHipHeight ?? null
  )
  
  // DEBUG MODE: Use spacebar instead of pose detection
  const rawIsJumping = debugMode ? debugJumping : poseJumping
  // Prevent jumping during tumble state
  const isJumping = playerState === 'running' ? rawIsJumping : false
  
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

  // Start webcam for game (skip in DEBUG MODE)
  useEffect(() => {
    if (debugMode) return // DEBUG MODE: Skip webcam when using spacebar
    
    async function startWebcam() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: 640, height: 480 } 
        })
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
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
      }
    }
    startWebcam()

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [debugMode])

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
    // DEBUG MODE: Skip pose loading check, start immediately
    if (debugMode || !isLoading) {
      setGameSpeed(BASE_LOG_SPEED) // Use centralized log speed constant
      resetSpawnTracking() // Initialize spawn tracking when game starts
    }
  }, [isLoading, debugMode])

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
      // Safety check: stop if game ended or speed is 0
      if (gameSpeedRef.current === 0 || gameOverRef.current) {
        spawnLoopActiveRef.current = false
        return
      }
      
      const now = Date.now()
      
      // Spawn logic: check if it's time to spawn a new log
      if (nextSpawnTimeRef.current !== null && now >= nextSpawnTimeRef.current) {
        // Calculate time since last spawn for spacing enforcement
        const timeSinceLastSpawn = now - lastSpawnTimeRef.current
        
        // Enforce minimum spacing
        if (timeSinceLastSpawn >= MIN_LOG_SPACING) {
          // Spawn a new log
          lastSpawnTimeRef.current = now
          setObstacles(prev => [...prev, {
            id: Date.now(),
            z: -25, // Spawn much further back so player has more reaction time
            x: 0 // Single lane
          }])
          
          // Calculate next spawn time with random spacing (MIN to MAX)
          const nextSpawnGap = MIN_LOG_SPACING + Math.random() * (MAX_LOG_SPACING - MIN_LOG_SPACING)
          nextSpawnTimeRef.current = now + nextSpawnGap
        } else {
          // Not enough time passed, schedule spawn after minimum spacing
          nextSpawnTimeRef.current = lastSpawnTimeRef.current + MIN_LOG_SPACING
        }
      }
      
      setObstacles(prev => {
        const updated = prev.map(obs => {
          const newZ = obs.z + gameSpeed // Use centralized BASE_LOG_SPEED (via gameSpeed state)
          
          // Collision detection
          // Player: x=0±0.5, y varies (0 when grounded, up to ~1.5 when jumping), z=0
          // Obstacle: x=0±1, y=0.5 (height 1, positioned at 0.5), z=newZ
          const playerPos = playerPositionRef.current
          const playerX = playerPos[0]
          const playerY = playerPos[1] // Height above ground
          const playerZ = playerPos[2] || 26 // Player is at z=26
          
          // Check X overlap (lateral collision) - log is narrower now (radius 0.5)
          const xOverlap = Math.abs(obs.x - playerX) < 0.8
          // Check Z overlap (depth collision) - obstacle is approaching from negative z
          // Log is shallower now (height 1.5, rotated), adjust collision zone
          // Player is at z=26, so check overlap relative to that
          const zOverlap = newZ > 24.5 && newZ < 27.0
          // Check Y overlap (vertical) - player must be low enough to hit obstacle
          // Log is at y=0.5, height 1.5 (diameter), but rotated so it's a cylinder lying flat
          // Log top is roughly at y=1.25 (0.5 + radius 0.75), player is safe if y > 1.3
          const yCollision = playerY < 1.3
          
          if (xOverlap && zOverlap && yCollision) {
            // Collision detected! Handle lives/tumble system
            // Only process collision if this obstacle hasn't hit the player yet
            if (!hitObstaclesRef.current.has(obs.id) && playerState === 'running') {
              hitObstaclesRef.current.add(obs.id) // Mark this obstacle as hit
              
              if (hearts > 1) {
                // Player has hearts remaining - lose one and enter tumble
                setHearts(prev => prev - 1)
                setPlayerState('tumbling') // Enter tumble state (prevents jumping)
              } else if (hearts === 1) {
                // Last heart - lose it and game over
                setHearts(0)
                setGameOver(true)
                setPlayerState('gameOver')
              }
            }
          }
          
          return { ...obs, z: newZ }
        })
        
        // Score obstacles that passed player (when log Z > player Z)
        const playerZ = playerPositionRef.current[2] || 26
        const scored = updated.filter(obs => obs.z > playerZ && !scoredObstaclesRef.current.has(obs.id))
        if (scored.length > 0) {
          scored.forEach(obs => scoredObstaclesRef.current.add(obs.id))
          setScore(prev => prev + scored.length)
        }
        
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
  }, [gameSpeed, gameOver])

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
      
      {/* Hearts Display */}
      <div style={{
        position: 'absolute',
        top: '20px',
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
        <Player position={26} isJumping={isJumping} customization={customization} onPositionUpdate={updatePlayerPosition} />

        {/* Obstacles - logs positioned slightly lower to match shallower height */}
        {obstacles.map(obs => (
          <LogObstacle key={obs.id} position={[obs.x, 0.5, obs.z]} />
        ))}
      </Canvas>
    </>
  )
}

export default RunnerScene

