import { Canvas } from '@react-three/fiber'
import LogObstacle from './LogObstacle'

function RunnerScene() {
  return (
    <Canvas camera={{ position: [0, 5, 10], fov: 50 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[20, 100]} />
        <meshStandardMaterial color="#4a7c59" />
      </mesh>

      {/* TODO: Add player character */}
      {/* TODO: Add log obstacles */}
      {/* TODO: Add forest background */}
    </Canvas>
  )
}

export default RunnerScene

