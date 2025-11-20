function LogObstacle({ position }) {
  return (
    <mesh position={position} rotation={[0, 0, Math.PI / 2]}>
      {/* Cylindrical log shape - radius 0.5, height 1.5, rotated to lie flat */}
      <cylinderGeometry args={[0.5, 0.5, 1.5, 16]} />
      <meshStandardMaterial color="#8b4513" />
    </mesh>
  )
}

export default LogObstacle

