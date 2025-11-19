import { useState, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import LogObstacle from './LogObstacle'
import Player from './Player'
import { usePose } from '../hooks/usePose'
import { useJumpDetection } from '../hooks/useJumpDetection'

// PRIVACY: Camera processing is in-memory only. Video is hidden and processed
// frame-by-frame for pose detection. No frames, images, or pose data are saved
// or stored anywhere. All data is discarded immediately after processing.

function RunnerScene({ calibrationData, customization }) {
  const videoRef = useRef(null)
  const playerPositionRef = useRef([0, 0, 0])
  const [obstacles, setObstacles] = useState([])
  const [gameSpeed, setGameSpeed] = useState(0)
  const [stream, setStream] = useState(null)
  const [gameOver, setGameOver] = useState(false)
  const [score, setScore] = useState(0)

  const { poses, isLoading } = usePose(videoRef)
  const { isJumping } = useJumpDetection(poses, calibrationData?.baselineHipHeight)

  // Start webcam for game
  useEffect(() => {
    async function startWebcam() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: 640, height: 480 } 
        })
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
          setStream(mediaStream)
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
  }, [])

  // Start game
  useEffect(() => {
    if (!isLoading) {
      setGameSpeed(0.02) // Slower starting speed
    }
  }, [isLoading])

  // Get player position for collision detection
  const updatePlayerPosition = (pos) => {
    playerPositionRef.current = pos
  }

  // Spawn obstacles - slower and more spaced out
  useEffect(() => {
    if (gameSpeed === 0 || gameOver) return

    let spawnTimer
    const spawnObstacle = () => {
      const baseSpawnRate = 4000 // 4 seconds base (slower, more spacing)
      const difficultyMultiplier = Math.min(1 + gameSpeed * 5, 1.5) // Slower increase
      const spawnRate = Math.max(baseSpawnRate / difficultyMultiplier, 2500) // Min 2.5 seconds

      setObstacles(prev => [...prev, {
        id: Date.now(),
        z: -10,
        x: 0 // Single lane
      }])
      
      spawnTimer = setTimeout(spawnObstacle, spawnRate)
    }

    spawnTimer = setTimeout(spawnObstacle, 4000) // Start after 4 seconds

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
          const newZ = obs.z + gameSpeed
          
          // Collision detection
          // Player: x=0±0.5, y varies (0 when grounded, up to ~1.5 when jumping), z=0
          // Obstacle: x=0±1, y=0.5 (height 1, positioned at 0.5), z=newZ
          const playerPos = playerPositionRef.current
          const playerX = playerPos[0]
          const playerY = playerPos[1] // Height above ground
          const playerZ = playerPos[2] || 0
          
          // Check X overlap (lateral collision)
          const xOverlap = Math.abs(obs.x - playerX) < 1.0
          // Check Z overlap (depth collision) - obstacle is approaching from negative z
          const zOverlap = newZ > -1.0 && newZ < 1.5
          // Check Y overlap (vertical) - player must be low enough to hit obstacle
          // Obstacle top is at y=1.0 (position 0.5 + height 0.5), player bottom is at y=0
          // Player is safe if jumping high enough (y > 1.2)
          const yCollision = playerY < 1.2
          
          if (xOverlap && zOverlap && yCollision) {
            // Collision detected!
            setGameOver(true)
          }
          
          return { ...obs, z: newZ }
        })
        
        // Remove obstacles that passed and increment score
        const passed = updated.filter(obs => obs.z > 2)
        const remaining = updated.filter(obs => obs.z <= 2)
        if (passed.length > 0) {
          setScore(prev => prev + passed.length)
        }
        return remaining
      })
    }, 16) // ~60fps

    return () => clearInterval(moveInterval)
  }, [gameSpeed, gameOver])

  // Increase difficulty (spawn rate, not speed) - slower increase
  useEffect(() => {
    if (gameOver) return
    
    const difficultyInterval = setInterval(() => {
      setGameSpeed(prev => Math.min(prev + 0.001, 0.04)) // Cap at 0.04 (slower max)
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
        style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
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
            onClick={() => window.location.reload()}
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
      
      <Canvas camera={{ position: [0, 2, 7], fov: 70, rotation: [0, 0, 0] }}>
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
        
        {/* Ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[20, 100]} />
          <meshStandardMaterial color="#4a7c59" />
        </mesh>

        {/* Player */}
        <Player position={0} isJumping={isJumping} customization={customization} onPositionUpdate={updatePlayerPosition} />

        {/* Obstacles */}
        {obstacles.map(obs => (
          <LogObstacle key={obs.id} position={[obs.x, 0.5, obs.z]} />
        ))}
      </Canvas>
    </>
  )
}

export default RunnerScene

