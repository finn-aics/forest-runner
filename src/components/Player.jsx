import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'

// Jump physics constants - easy to tune
const JUMP_FORCE = 0.3 // Jump height - comfortable clearance (reduced from 0.9, between original 0.18 and too-high 0.9)
const GRAVITY = -0.8 // Stronger gravity for snappier jump (was -0.5)

function Player({ position, isJumping, playerState = 'running', customization, onPositionUpdate, isPaused = false }) {
  const playerRef = useRef()
  const velocityY = useRef(0)
  const isGrounded = useRef(true)
  const prevJumping = useRef(false)
  const [opacity, setOpacity] = useState(1) // For hit flashing effect
  const flashTimerRef = useRef(null)
  const prevPlayerStateRef = useRef(playerState)

  useFrame(() => {
    if (!playerRef.current) return
    
    // Pause check: stop all player updates if paused
    if (isPaused) {
      return
    }
    
    // Stop all movement during game over
    if (playerState === 'gameOver') {
      // Keep player grounded and stop all movement
      if (playerRef.current.position.y > 0.5) {
        playerRef.current.position.y = 0.5
      }
      velocityY.current = 0
      isGrounded.current = true
      return
    }

    // Detect jump start directly in useFrame for minimal latency (no useEffect delay)
    // Jump on rising edge (false -> true) when grounded - check every frame
    // Allow jumping during running and tumbling states (game over already handled above)
    if (isJumping && !prevJumping.current && isGrounded.current && (playerState === 'running' || playerState === 'tumbling')) {
      velocityY.current = JUMP_FORCE
      isGrounded.current = false
    }
    prevJumping.current = isJumping

    // Apply gravity (no slowdown during tumble - only logs slow down)
    velocityY.current += GRAVITY * 0.016

    // Update position (no slowdown during tumble - player stays stationary, logs slow down)
    const newY = playerRef.current.position.y + velocityY.current

    // Ground collision - player base is at y=0.5 (group position)
    if (newY <= 0.5) {
      playerRef.current.position.y = 0.5
      velocityY.current = 0
      isGrounded.current = true
    } else {
      playerRef.current.position.y = newY
      // Only set isGrounded false if we're actually moving up
      if (velocityY.current > 0) {
        isGrounded.current = false
      }
    }

    // Update position for collision detection
    if (onPositionUpdate) {
      onPositionUpdate([
        playerRef.current.position.x,
        playerRef.current.position.y,
        playerRef.current.position.z
      ])
    }
    
    // Detect when player enters tumble state (takes damage) for flashing effect
    if (playerState === 'tumbling' && prevPlayerStateRef.current === 'running') {
      // Just entered tumble - start flashing effect
      let flashCount = 0
      const flashInterval = setInterval(() => {
        setOpacity(prev => prev === 1 ? 0.25 : 1) // Alternate between 100% and 25% opacity
        flashCount++
        if (flashCount >= 6) { // 3-4 flashes (6 toggles = 3 full cycles)
          clearInterval(flashInterval)
          setOpacity(1) // Reset to full opacity
          flashTimerRef.current = null
        }
      }, 100) // Flash every 100ms for snappy feedback
      flashTimerRef.current = flashInterval
    }
    
    // Clean up flashing if player exits tumble early
    if (playerState !== 'tumbling' && flashTimerRef.current) {
      clearInterval(flashTimerRef.current)
      flashTimerRef.current = null
      setOpacity(1) // Reset to full opacity
    }
    
    prevPlayerStateRef.current = playerState
  })
  
  // Cleanup flashing timer on unmount
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) {
        clearInterval(flashTimerRef.current)
      }
    }
  }, [])

  return (
    <group ref={playerRef} position={[0, 0.5, position]}>
      {/* Head */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial 
          color={customization?.skinColor || '#fdbcb4'} 
          transparent
          opacity={opacity}
        />
      </mesh>
      
      {/* Hair */}
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={[0.65, 0.2, 0.65]} />
        <meshStandardMaterial 
          color={customization?.hairColor || '#8b4513'} 
          transparent
          opacity={opacity}
        />
      </mesh>
      
      {/* Body (shirt) */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.7, 0.8, 0.5]} />
        <meshStandardMaterial 
          color={customization?.shirtColor || '#ff0000'} 
          transparent
          opacity={opacity}
        />
      </mesh>
      
      {/* Legs */}
      <mesh position={[-0.15, -0.1, 0]}>
        <boxGeometry args={[0.2, 0.4, 0.2]} />
        <meshStandardMaterial 
          color={customization?.skinColor || '#fdbcb4'} 
          transparent
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0.15, -0.1, 0]}>
        <boxGeometry args={[0.2, 0.4, 0.2]} />
        <meshStandardMaterial 
          color={customization?.skinColor || '#fdbcb4'} 
          transparent
          opacity={opacity}
        />
      </mesh>
    </group>
  )
}

export default Player
