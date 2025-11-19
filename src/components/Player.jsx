import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'

function Player({ position, isJumping, customization, onPositionUpdate }) {
  const playerRef = useRef()
  const velocityY = useRef(0)
  const isGrounded = useRef(true)
  const prevJumping = useRef(false)

  // Detect jump start (edge detection)
  useEffect(() => {
    if (isJumping && !prevJumping.current && isGrounded.current) {
      velocityY.current = 0.3
      isGrounded.current = false
    }
    prevJumping.current = isJumping
  }, [isJumping])

  useFrame(() => {
    if (!playerRef.current) return

    const gravity = -0.5

    // Apply gravity
    velocityY.current += gravity * 0.016

    // Update position
    const newY = playerRef.current.position.y + velocityY.current

    // Ground collision - player base is at y=0.5 (group position)
    if (newY <= 0.5) {
      playerRef.current.position.y = 0.5
      velocityY.current = 0
      isGrounded.current = true
    } else {
      playerRef.current.position.y = newY
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
