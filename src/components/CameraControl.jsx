import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

function CameraControl() {
  const { camera } = useThree()

  useEffect(() => {
    // Subway Surfers style: camera further back, higher, angled down
    // Camera positioned far back and high up for wide view
    camera.position.set(0, 7.5, 32)
    // Look ahead of player (downward angle) to show path far ahead
    // Looking ahead makes player appear lower on screen
    camera.lookAt(0, 0.5, 14) // Look ahead of player for endless runner feel
    // Ensure camera up vector is correct
    camera.up.set(0, 1, 0)
    camera.updateProjectionMatrix()
  }, [camera])

  return null
}

export default CameraControl

