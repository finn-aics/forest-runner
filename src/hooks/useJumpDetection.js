import { useState, useEffect, useRef } from 'react'

export function useJumpDetection(poses, baselineHipHeight = null) {
  const [isJumping, setIsJumping] = useState(false)
  const [currentHipHeight, setCurrentHipHeight] = useState(null)
  const smoothedHipHeightRef = useRef(null)
  const jumpThresholdRef = useRef(null)

  useEffect(() => {
    if (!poses || poses.length === 0) return

    const pose = poses[0]
    const leftHip = pose.keypoints.find(kp => kp.name === 'left_hip')
    const rightHip = pose.keypoints.find(kp => kp.name === 'right_hip')

    if (!leftHip || !rightHip) return

    const avgHipY = (leftHip.y + rightHip.y) / 2

    // Smooth the hip height
    if (smoothedHipHeightRef.current === null) {
      smoothedHipHeightRef.current = avgHipY
    } else {
      smoothedHipHeightRef.current = smoothedHipHeightRef.current * 0.7 + avgHipY * 0.3
    }

    setCurrentHipHeight(smoothedHipHeightRef.current)

    // Set baseline if provided
    if (baselineHipHeight !== null && jumpThresholdRef.current === null) {
      jumpThresholdRef.current = baselineHipHeight - 30 // threshold for jump detection
    }

    // Detect jump: hip moves significantly above baseline
    if (jumpThresholdRef.current !== null) {
      const jumping = smoothedHipHeightRef.current < jumpThresholdRef.current
      setIsJumping(jumping)
    }
  }, [poses, baselineHipHeight])

  return { isJumping, currentHipHeight }
}

