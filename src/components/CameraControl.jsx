import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

function CameraControl() {
  const { camera } = useThree()

  useEffect(() => {
    // Position camera higher and adjust view to center player in screen
    // Camera position: higher up, further back
    camera.position.set(0, 4, 7)
    // Look at a point where the player is - adjusting Y to center the view better
    // The key is adjusting the lookAt Y value to shift what appears in the center
    camera.lookAt(0, 0.5, 0) // Look at ground/player level
    // Ensure camera up vector is correct
    camera.up.set(0, 1, 0)
    camera.updateProjectionMatrix()
  }, [camera])

  return null
}

export default CameraControl

