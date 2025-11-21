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

    // Minimal smoothing - prioritize maximum responsiveness (reduced from 0.5/0.5 to 0.3/0.7)
    if (smoothedHipHeightRef.current === null) {
      smoothedHipHeightRef.current = avgHipY
    } else {
      smoothedHipHeightRef.current = smoothedHipHeightRef.current * 0.3 + avgHipY * 0.7
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
    // Further reduced movement threshold for maximum responsiveness (was 25, now 15)
    if (jumpThresholdRef.current !== null && smoothedHipHeightRef.current !== null && baselineHipHeight !== null) {
      // Detect jump if hips move above baseline - very low threshold for near-instant response
      const hipMovement = baselineHipHeight - smoothedHipHeightRef.current
      const jumping = smoothedHipHeightRef.current < jumpThresholdRef.current && hipMovement >= 15
      setIsJumping(jumping)
    } else {
      // Can't detect jumps without baseline threshold
      setIsJumping(false)
    }
  }, [poses, baselineHipHeight])

  return { isJumping, currentHipHeight }
}

