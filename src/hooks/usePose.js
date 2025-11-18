import { useState, useEffect, useRef } from 'react'
import * as poseDetection from '@tensorflow-models/pose-detection'
import * as tf from '@tensorflow/tfjs'

export function usePose(videoRef) {
  const [detector, setDetector] = useState(null)
  const [poses, setPoses] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const animationFrameRef = useRef(null)

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

  useEffect(() => {
    if (!detector || !videoRef?.current) return

    async function detectPose() {
      if (videoRef.current?.readyState === 4) {
        const detectedPoses = await detector.estimatePoses(videoRef.current)
        setPoses(detectedPoses)
      }
      animationFrameRef.current = requestAnimationFrame(detectPose)
    }

    detectPose()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [detector, videoRef])

  return { poses, isLoading }
}

