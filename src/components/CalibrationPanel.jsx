import { useRef, useEffect, useState } from 'react'
import { usePose } from '../hooks/usePose'
import { useJumpDetection } from '../hooks/useJumpDetection'

// PRIVACY: All camera processing is in-memory only. No frames, images, or pose data
// are saved, uploaded, cached, or stored anywhere. Video stream is only displayed
// in the browser and processed frame-by-frame, then immediately discarded.

function CalibrationPanel({ cameraEnabled, onComplete }) {
  const videoRef = useRef(null)
  const [step, setStep] = useState(0) // 0 = waiting for start, 1 = standing, 2 = jumping
  const [baselineHipHeight, setBaselineHipHeight] = useState(null)
  const [jumpHeights, setJumpHeights] = useState([])
  const [stream, setStream] = useState(null)
  const baselineSamples = useRef([])
  const prevJumping = useRef(false)
  const [countdown, setCountdown] = useState(null)

  const { poses, isLoading } = usePose(videoRef, cameraEnabled)
  const { isJumping, currentHipHeight } = useJumpDetection(poses, baselineHipHeight)
  const [videoReady, setVideoReady] = useState(false)
  const [posesDetected, setPosesDetected] = useState(false)

  // Start/stop webcam based on camera toggle
  // Use ref to track stream to avoid dependency loop
  const streamRef = useRef(null)
  
  useEffect(() => {
    // Store stream in ref for cleanup
    streamRef.current = stream
  }, [stream])
  
  useEffect(() => {
    if (!cameraEnabled) {
      // Camera is OFF - stop all tracks and clear video
      const currentStream = streamRef.current
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop())
        setStream(null)
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
        setVideoReady(false)
      }
      return
    }

    // Prevent multiple starts - check if stream already exists
    if (streamRef.current) {
      return // Already have a stream, don't start again
    }

    // Camera is ON - start webcam (only once)
    async function startWebcam() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: 640, height: 480 } 
        })
        
        // Check if camera was disabled while waiting for permission
        if (!cameraEnabled || streamRef.current) {
          mediaStream.getTracks().forEach(track => track.stop())
          return
        }
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
          streamRef.current = mediaStream
          setStream(mediaStream)
          
          // Wait for video to be ready
          videoRef.current.onloadedmetadata = () => {
            setVideoReady(true)
          }
        }
      } catch (error) {
        console.error('Error accessing webcam:', error)
        alert('Could not access webcam. Please allow camera access.')
        streamRef.current = null
      }
    }
    startWebcam()

    return () => {
      // Cleanup: stop all tracks when component unmounts or camera is toggled off
      const currentStream = streamRef.current
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }
  }, [cameraEnabled]) // Removed stream from dependencies to prevent loop

  // Track when poses are detected
  useEffect(() => {
    if (poses && poses.length > 0) {
      const pose = poses[0]
      const leftHip = pose.keypoints.find(kp => kp.name === 'left_hip')
      const rightHip = pose.keypoints.find(kp => kp.name === 'right_hip')
      if (leftHip && rightHip) {
        setPosesDetected(true)
      } else {
        setPosesDetected(false)
      }
    } else {
      setPosesDetected(false)
    }
  }, [poses])

  // Start countdown
  const handleStartCalibration = () => {
    setCountdown(3)
  }

  // Countdown logic
  useEffect(() => {
    if (countdown === null || countdown === 0) return

    const timer = setTimeout(() => {
      if (countdown === 1) {
        // After showing "1" for 1 second, start calibration
        setStep(1)
        setCountdown(null)
      } else {
        // Decrement countdown
        setCountdown(countdown - 1)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown])

  // Step 1: Measure baseline hip height (standing still) - collect stable samples
  useEffect(() => {
    if (step === 1 && currentHipHeight !== null && baselineHipHeight === null) {
      baselineSamples.current.push(currentHipHeight)
      
      // Keep only last 20 samples (about 1 second at ~60fps)
      if (baselineSamples.current.length > 20) {
        baselineSamples.current.shift()
      }

      // Once we have enough samples, check stability and set baseline
      if (baselineSamples.current.length >= 15) {
        const samples = baselineSamples.current
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length
        const variance = samples.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / samples.length
        const stdDev = Math.sqrt(variance)
        
        // If stable (low variance), set baseline
        if (stdDev < 5) { // Low variance means standing still
          setBaselineHipHeight(avg)
          setStep(2)
          baselineSamples.current = []
        }
      }
    }
  }, [step, currentHipHeight, baselineHipHeight])

  // Step 2: Detect jumps and measure jump heights - use edge detection to count once per jump
  useEffect(() => {
    if (step === 2 && baselineHipHeight !== null && currentHipHeight !== null) {
      // Edge detection: only count when isJumping changes from false to true
      if (isJumping && !prevJumping.current) {
        const jumpHeight = baselineHipHeight - currentHipHeight
        if (jumpHeight > 20) {
          setJumpHeights(prev => [...prev, Math.round(jumpHeight)])
        }
      }
      prevJumping.current = isJumping
    }
  }, [step, baselineHipHeight, isJumping, currentHipHeight])

  const handleComplete = () => {
    // Stop webcam stream - all video data discarded immediately
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }
    // PRIVACY: Only pass numeric calibration values (no images or frame data)
    const avgJumpHeight = jumpHeights.length > 0 
      ? jumpHeights.reduce((a, b) => a + b, 0) / jumpHeights.length 
      : 30
    onComplete({ baselineHipHeight, avgJumpHeight })
  }

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#1a1a1a',
      color: 'white'
    }}>
      <h1>Calibration</h1>
      {!cameraEnabled && (
        <p style={{ color: '#ff6b6b', fontSize: '1.2em', marginBottom: '20px' }}>
          Camera is off. Turn it on to play.
        </p>
      )}
      {cameraEnabled && isLoading && <p>Loading pose detection model...</p>}
      {cameraEnabled && !videoReady && !isLoading && <p style={{ color: '#ffa500' }}>Waiting for camera...</p>}
      {videoReady && !posesDetected && !isLoading && step === 0 && (
        <p style={{ color: '#ffa500' }}>Stand in view - Make sure you're fully visible!</p>
      )}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline
        muted
        style={{ width: 640, height: 480, margin: '20px', border: '2px solid white' }}
      />
      {step === 0 && videoReady && (
        <>
          <p>Get ready! Stand in the center of the frame.</p>
          <button 
            onClick={handleStartCalibration}
            disabled={!posesDetected}
            style={{ 
              marginTop: '20px', 
              padding: '15px 30px',
              fontSize: '18px',
              cursor: posesDetected ? 'pointer' : 'not-allowed',
              background: posesDetected ? '#4a7c59' : '#555',
              color: 'white',
              border: 'none',
              borderRadius: '5px'
            }}
          >
            Start Calibration
          </button>
        </>
      )}
      {countdown !== null && countdown > 0 && (
        <div style={{ 
          fontSize: '5em', 
          fontWeight: 'bold', 
          margin: '20px',
          color: countdown === 1 ? '#0f0' : '#ffa500'
        }}>
          {countdown}
        </div>
      )}
      {step === 1 && countdown === null && (
        <>
          <p>Step 1: Stand normally in view</p>
          {currentHipHeight !== null ? (
            <p>Calibrating baseline... ({Math.round(currentHipHeight)})</p>
          ) : (
            <p style={{ color: '#ffa500' }}>Waiting for pose detection...</p>
          )}
        </>
      )}
      {step === 2 && (
        <>
          <p>Step 2: Perform a few jumps</p>
          <p>Jumps detected: {jumpHeights.length}</p>
          {isJumping && <p style={{ color: '#0f0', fontSize: '1.2em', fontWeight: 'bold' }}>JUMPING!</p>}
        </>
      )}
      <button 
        onClick={handleComplete} 
        disabled={jumpHeights.length === 0}
        style={{ 
          marginTop: '20px', 
          padding: '10px 20px',
          fontSize: '16px',
          cursor: jumpHeights.length === 0 ? 'not-allowed' : 'pointer'
        }}
      >
        Complete Calibration ({jumpHeights.length} jumps)
      </button>
    </div>
  )
}

export default CalibrationPanel

