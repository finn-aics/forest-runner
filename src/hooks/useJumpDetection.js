import { useState, useEffect, useRef } from 'react'

// PRIVACY: Only processes numeric pose keypoint coordinates. No images,
// frames, or video data. All calculations are in-memory only and discarded
// when component unmounts.

export function useJumpDetection(poses, baselineHipHeight = null) {
  const [isJumping, setIsJumping] = useState(false)
  const [currentHipHeight, setCurrentHipHeight] = useState(null)
  const smoothedHipHeightRef = useRef(null)
  const jumpThresholdRef = useRef(null)
  const prevBaselineRef = useRef(null)

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

    // Check if keypoints exist and have valid scores (higher confidence required)
    if (!leftHip || !rightHip || !leftHip.score || !rightHip.score || leftHip.score < 0.4 || rightHip.score < 0.4) {
      return
    }

    // Validate hip keypoints - ensure both hips are detected and close in height (validate they're actual hips)
    const hipHeightDiff = Math.abs(leftHip.y - rightHip.y)
    if (hipHeightDiff > 50) {
      // Hips too far apart in height - likely misdetected (could be shoulders/arms)
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

    // Set baseline threshold if provided (reset when baseline changes)
    if (baselineHipHeight !== null && baselineHipHeight !== undefined) {
      // Reset threshold if baseline changed
      if (prevBaselineRef.current !== baselineHipHeight) {
        // Increased threshold from 30 to 45 - requires larger hip movement (actual jump, not shrug)
        jumpThresholdRef.current = baselineHipHeight - 45
        prevBaselineRef.current = baselineHipHeight
      }
    } else {
      // No baseline, reset threshold
      jumpThresholdRef.current = null
      prevBaselineRef.current = null
    }

    // Detect jump: hip moves significantly above baseline (lower Y value = higher up)
    // Require substantial movement - tighten threshold to avoid false positives
    if (jumpThresholdRef.current !== null && smoothedHipHeightRef.current !== null && baselineHipHeight !== null) {
      // Only detect jump if hips move significantly above baseline (at least 45 pixels)
      // This filters out casual movements, shrugs, and arm movements
      const hipMovement = baselineHipHeight - smoothedHipHeightRef.current
      const jumping = smoothedHipHeightRef.current < jumpThresholdRef.current && hipMovement >= 35
      setIsJumping(jumping)
    } else {
      // Can't detect jumps without baseline threshold
      setIsJumping(false)
    }
  }, [poses, baselineHipHeight])

  return { isJumping, currentHipHeight }
}

