import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

function CameraControl() {
  const { camera } = useThree()

  useEffect(() => {
    // Position camera much further back to show more of the scene
    // Camera at z=25, player at z=20 - adjust lookAt to center on player
    camera.position.set(0, 5.5, 25)
    // Look at player area at z=20 to properly center the view
    camera.lookAt(0, 0.5, 20) // Look at player position for proper centering
    // Ensure camera up vector is correct
    camera.up.set(0, 1, 0)
    camera.updateProjectionMatrix()
  }, [camera])

  return null
}

export default CameraControl

