function LogObstacle({ position }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[2, 1, 2]} />
      <meshStandardMaterial color="#8b4513" />
    </mesh>
  )
}

export default LogObstacle

