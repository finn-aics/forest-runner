import { useGLTF } from '@react-three/drei'

function TreeModel2() {
  const { scene } = useGLTF('/models/fabulous_tree_016.glb')
  
  return (
    <primitive object={scene} scale={[3.1, 3.1, 3.1]} position={[11, 0, -16]} rotation={[0, Math.PI * 0.2, 0]} />
  )
}

// Preload the model for better performance
useGLTF.preload('/models/fabulous_tree_016.glb')

export default TreeModel2

