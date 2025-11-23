function LogObstacle({ position }) {
  return (
    <mesh position={position} rotation={[0, 0, Math.PI / 2]}>
      {/* Cylindrical log shape - radius 0.5 (original thickness), height 4.5 (3x longer), rotated to lie flat */}
      <cylinderGeometry args={[0.5, 0.5, 4.5, 16]} />
      <meshStandardMaterial color="#8b4513" />
    </mesh>
  )
}

export default LogObstacle

