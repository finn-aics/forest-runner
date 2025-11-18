import { useRef } from 'react'

function CalibrationPanel({ onComplete }) {
  const videoRef = useRef(null)

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
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        style={{ width: 640, height: 480, margin: '20px' }}
      />
      <p>Step 1: Stand normally in view</p>
      <p>Step 2: Perform a few jumps</p>
      <button onClick={onComplete}>Complete Calibration</button>
      {/* TODO: Integrate usePose and useJumpDetection */}
    </div>
  )
}

export default CalibrationPanel

