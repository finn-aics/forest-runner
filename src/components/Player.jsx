import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'

// Jump physics constants - easy to tune
const JUMP_FORCE = 0.3 // Jump height - comfortable clearance (reduced from 0.9, between original 0.18 and too-high 0.9)
const GRAVITY = -0.8 // Stronger gravity for snappier jump (was -0.5)

function Player({ position, isJumping, customization, onPositionUpdate }) {
  const playerRef = useRef()
  const velocityY = useRef(0)
  const isGrounded = useRef(true)
  const prevJumping = useRef(false)

  useFrame(() => {
    if (!playerRef.current) return

    // Detect jump start directly in useFrame for minimal latency (no useEffect delay)
    // Jump on rising edge (false -> true) when grounded - check every frame
    if (isJumping && !prevJumping.current && isGrounded.current) {
      velocityY.current = JUMP_FORCE
      isGrounded.current = false
    }
    prevJumping.current = isJumping

    // Apply gravity
    velocityY.current += GRAVITY * 0.016

    // Update position
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
  })

  return (
    <group ref={playerRef} position={[0, 0.5, position]}>
      {/* Head */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial color={customization?.skinColor || '#fdbcb4'} />
      </mesh>
      
      {/* Hair */}
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={[0.65, 0.2, 0.65]} />
        <meshStandardMaterial color={customization?.hairColor || '#8b4513'} />
      </mesh>
      
      {/* Body (shirt) */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.7, 0.8, 0.5]} />
        <meshStandardMaterial color={customization?.shirtColor || '#ff0000'} />
      </mesh>
      
      {/* Legs */}
      <mesh position={[-0.15, -0.1, 0]}>
        <boxGeometry args={[0.2, 0.4, 0.2]} />
        <meshStandardMaterial color={customization?.skinColor || '#fdbcb4'} />
      </mesh>
      <mesh position={[0.15, -0.1, 0]}>
        <boxGeometry args={[0.2, 0.4, 0.2]} />
        <meshStandardMaterial color={customization?.skinColor || '#fdbcb4'} />
      </mesh>
    </group>
  )
}

export default Player
