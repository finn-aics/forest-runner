import { useState, useEffect } from 'react'
import RunnerScene from './components/RunnerScene'
import CalibrationPanel from './components/CalibrationPanel'
import CustomizationPanel from './components/CustomizationPanel'

function App() {
  const [gameState, setGameState] = useState('calibration') // 'calibration' | 'customization' | 'playing'
  const [calibrationData, setCalibrationData] = useState(null)
  const [customization, setCustomization] = useState(null)
  
  // DEBUG MODE: Development-only toggle to skip calibration/customization and use spacebar
  const [debugMode, setDebugMode] = useState(false)
  
  // CAMERA PRIVACY: User-controlled camera toggle
  const [cameraEnabled, setCameraEnabled] = useState(false)
  
  // DEBUG MODE: Skip directly to game when enabled
  useEffect(() => {
    if (debugMode && gameState === 'calibration') {
      setGameState('playing')
    }
  }, [debugMode, gameState])

  return (
    <div className="app">
      {/* CAMERA TOGGLE: Always visible for privacy control */}
      <div style={{ position: 'fixed', top: 10, left: 10, zIndex: 1000, background: 'white', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cameraEnabled}
            onChange={(e) => setCameraEnabled(e.target.checked)}
          />
          <span>Camera: {cameraEnabled ? 'ON' : 'OFF'}</span>
        </label>
        {/* DEBUG MODE: Toggle button on initial screen */}
        {gameState === 'calibration' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
            />
            <span>Debug Mode</span>
          </label>
        )}
      </div>
      
      {gameState === 'calibration' && !debugMode && (
        <CalibrationPanel 
          cameraEnabled={cameraEnabled}
          onComplete={(data) => {
            setCalibrationData(data)
            setGameState('customization')
          }} 
        />
      )}
      {gameState === 'customization' && !debugMode && (
        <CustomizationPanel onComplete={(colors) => {
          setCustomization(colors)
          setGameState('playing')
        }} />
      )}
      {gameState === 'playing' && (
        <RunnerScene 
          calibrationData={debugMode ? { baselineHipHeight: 300 } : calibrationData} 
          customization={debugMode ? { shirtColor: '#ff0000', hairColor: '#8b4513', skinColor: '#fdbcb4' } : customization}
          debugMode={debugMode}
          cameraEnabled={cameraEnabled}
        />
      )}
    </div>
  )
}

export default App

