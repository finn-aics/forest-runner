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
  const scoredObstaclesRef = useRef(new Set())
  const lastSpawnTimeRef = useRef(0)
  
  // DEBUG MODE: Spacebar jump detection
  const [debugJumping, setDebugJumping] = useState(false)

  // Reset game function - restarts game without going back to calibration
  const resetGame = () => {
    setObstacles([])
    setScore(0)
    setGameOver(false)
    setGameKey(prev => prev + 1) // Force re-render with new key
    playerPositionRef.current = [0, 0.5, 26] // Reset player position (z=26)
    scoredObstaclesRef.current.clear() // Reset scored obstacles tracking
    // Set to past time so first log can spawn after FIRST_LOG_DELAY on restart
    lastSpawnTimeRef.current = Date.now() - MIN_LOG_SPACING
    // Manually restart game speed after reset (since isLoading won't change)
    setGameSpeed(BASE_LOG_SPEED)
  }

  const { poses, isLoading } = usePose(videoRef)
  const { isJumping: poseJumping } = useJumpDetection(
    poses, 
    calibrationData?.baselineHipHeight ?? null
  )
  
  // DEBUG MODE: Use spacebar instead of pose detection
  const isJumping = debugMode ? debugJumping : poseJumping
  
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

  // Start game
  useEffect(() => {
    // DEBUG MODE: Skip pose loading check, start immediately
    if (debugMode || !isLoading) {
      setGameSpeed(BASE_LOG_SPEED) // Use centralized log speed constant
      // Set to past time so first log can spawn after FIRST_LOG_DELAY without spacing restriction
      lastSpawnTimeRef.current = Date.now() - MIN_LOG_SPACING
    }
  }, [isLoading, debugMode])

  // Get player position for collision detection
  const updatePlayerPosition = (pos) => {
    playerPositionRef.current = pos
  }

  // Spawn obstacles - with minimum spacing enforcement
  useEffect(() => {
    if (gameSpeed === 0 || gameOver) return

    let spawnTimer
    const spawnObstacle = () => {
      const now = Date.now()
      const timeSinceLastSpawn = now - lastSpawnTimeRef.current
      
      // Calculate desired spawn rate with difficulty scaling
      const baseSpawnRate = 5000 // 5 seconds base
      const difficultyMultiplier = Math.min(1 + gameSpeed * 5, 1.5)
      const desiredSpawnRate = baseSpawnRate / difficultyMultiplier
      
      // Enforce minimum spacing, then add randomness between MIN and MAX for variation
      const minDelay = Math.max(MIN_LOG_SPACING - timeSinceLastSpawn, 0)
      const randomExtra = minDelay === 0 ? Math.random() * (MAX_LOG_SPACING - MIN_LOG_SPACING) : 0
      const spawnDelay = minDelay + randomExtra
      
      // Calculate next spawn time with random spacing
      const nextSpawnGap = MIN_LOG_SPACING + Math.random() * (MAX_LOG_SPACING - MIN_LOG_SPACING)

      if (spawnDelay === 0) {
        // Spawn now if enough time has passed
        lastSpawnTimeRef.current = now
        setObstacles(prev => [...prev, {
          id: Date.now(),
          z: -25, // Spawn much further back so player has more reaction time
          x: 0 // Single lane
        }])
        spawnTimer = setTimeout(spawnObstacle, nextSpawnGap)
      } else {
        // Wait for minimum spacing
        spawnTimer = setTimeout(() => {
          lastSpawnTimeRef.current = Date.now()
          setObstacles(prev => [...prev, {
            id: Date.now(),
            z: -25,
            x: 0
          }])
          spawnTimer = setTimeout(spawnObstacle, nextSpawnGap)
        }, spawnDelay)
      }
    }

    spawnTimer = setTimeout(spawnObstacle, FIRST_LOG_DELAY) // Reduced initial delay

    return () => {
      if (spawnTimer) clearTimeout(spawnTimer)
    }
  }, [gameSpeed, gameOver])

  // Move obstacles and check collisions
  useEffect(() => {
    if (gameSpeed === 0 || gameOver) return

    const moveInterval = setInterval(() => {
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
            // Collision detected!
            setGameOver(true)
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

    return () => clearInterval(moveInterval)
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

