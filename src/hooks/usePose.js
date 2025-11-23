import { useState, useEffect, useRef } from 'react'
import * as poseDetection from '@tensorflow-models/pose-detection'
import * as tf from '@tensorflow/tfjs'

// PRIVACY: Processes video frames in-memory only. Each frame is analyzed and
// immediately discarded. Only pose keypoint coordinates (numbers) are kept
// temporarily in state, then discarded when component unmounts. No images
// or video frames are saved, cached, uploaded, or stored.

export function usePose(videoRef, cameraEnabled = true) {
  const [detector, setDetector] = useState(null)
  const [poses, setPoses] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const animationFrameRef = useRef(null)
  const cameraEnabledRef = useRef(cameraEnabled)

  useEffect(() => {
    async function initPoseDetection() {
      await tf.ready()
      const detectorConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      }
      const poseDetector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        detectorConfig
      )
      setDetector(poseDetector)
      setIsLoading(false)
    }

    initPoseDetection()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  // Keep cameraEnabled ref in sync
  useEffect(() => {
    cameraEnabledRef.current = cameraEnabled
  }, [cameraEnabled])
  
  useEffect(() => {
    // Stop pose detection if camera is disabled
    if (!cameraEnabled) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      setPoses(null) // Clear poses when camera is off
      return
    }

    // Prevent multiple loops - check if loop is already running
    if (animationFrameRef.current) {
      return // Loop already running, don't start another
    }

    if (!detector || !videoRef?.current) return

    let isRunning = true

    async function detectPose() {
      // Stop if camera was disabled during detection or loop was stopped
      if (!cameraEnabledRef.current || !isRunning) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = null
        }
        return
      }

      // Check if video is ready and has valid dimensions
      if (videoRef.current && 
          (videoRef.current.readyState === 4 || videoRef.current.readyState >= 2) &&
          videoRef.current.videoWidth > 0 && 
          videoRef.current.videoHeight > 0) {
        try {
          // Process frame in-memory only - no storage or caching
          const detectedPoses = await detector.estimatePoses(videoRef.current)
          // Only store numeric keypoint coordinates (not video frames)
          // Use functional update to prevent unnecessary re-renders
          setPoses(prev => detectedPoses)
          // Frame data automatically discarded by browser after processing
        } catch (error) {
          console.error('Error detecting poses:', error)
        }
      }
      
      // Schedule next frame only if still running
      if (isRunning && cameraEnabledRef.current) {
        animationFrameRef.current = requestAnimationFrame(detectPose)
      }
    }

    detectPose()

    return () => {
      // Cleanup: stop loop when component unmounts or camera is disabled
      isRunning = false
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [detector, videoRef, cameraEnabled]) // cameraEnabled needed to restart when toggled on

  return { poses, isLoading }
}

