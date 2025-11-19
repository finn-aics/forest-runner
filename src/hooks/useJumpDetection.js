import { useState, useEffect, useRef } from 'react'

// PRIVACY: Only processes numeric pose keypoint coordinates. No images,
// frames, or video data. All calculations are in-memory only and discarded
// when component unmounts.

export function useJumpDetection(poses, baselineHipHeight = null) {
  const [isJumping, setIsJumping] = useState(false)
  const [currentHipHeight, setCurrentHipHeight] = useState(null)
  const smoothedHipHeightRef = useRef(null)
  const jumpThresholdRef = useRef(null)

  useEffect(() => {
    if (!poses || poses.length === 0) {
      // Reset when no poses detected
      smoothedHipHeightRef.current = null
      setCurrentHipHeight(null)
      setIsJumping(false)
      return
    }

    const pose = poses[0]
    // MoveNet keypoints may use different naming - try both formats
    let leftHip = pose.keypoints.find(kp => kp.name === 'left_hip' || kp.name === 'leftHip')
    let rightHip = pose.keypoints.find(kp => kp.name === 'right_hip' || kp.name === 'rightHip')
    
    // If not found, try by index (MoveNet has 17 keypoints in order)
    if (!leftHip || !rightHip) {
      if (pose.keypoints.length >= 17) {
        // MoveNet keypoint order: nose, left_eye, right_eye, left_ear, right_ear,
        // left_shoulder, right_shoulder, left_elbow, right_elbow, left_wrist, right_wrist,
        // left_hip (11), right_hip (12), left_knee, right_knee, left_ankle, right_ankle
        leftHip = pose.keypoints[11]
        rightHip = pose.keypoints[12]
      }
    }

    // Check if keypoints exist and have valid scores (confidence > 0.3)
    if (!leftHip || !rightHip || !leftHip.score || !rightHip.score || leftHip.score < 0.3 || rightHip.score < 0.3) {
      return
    }

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
    if (jumpThresholdRef.current !== null && smoothedHipHeightRef.current !== null) {
      const jumping = smoothedHipHeightRef.current < jumpThresholdRef.current
      setIsJumping(jumping)
    } else {
      setIsJumping(false)
    }
  }, [poses, baselineHipHeight])

  return { isJumping, currentHipHeight }
}

