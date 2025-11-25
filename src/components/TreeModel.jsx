import { useGLTF } from '@react-three/drei'

const TreeModel = ({ position = [9, 0, -10] }) => {
  const { scene } = useGLTF('/models/fabulous_tree_015.glb')
  
  return (
    <primitive object={scene} scale={[2.8, 2.8, 2.8]} position={position} />
  )
}

// Preload the model for better performance
useGLTF.preload('/models/fabulous_tree_015.glb')

export default TreeModel

