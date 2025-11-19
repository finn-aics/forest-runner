import { useState } from 'react'
import RunnerScene from './components/RunnerScene'
import CalibrationPanel from './components/CalibrationPanel'
import CustomizationPanel from './components/CustomizationPanel'

function App() {
  const [gameState, setGameState] = useState('calibration') // 'calibration' | 'customization' | 'playing'
  const [calibrationData, setCalibrationData] = useState(null)
  const [customization, setCustomization] = useState(null)

  return (
    <div className="app">
      {gameState === 'calibration' && (
        <CalibrationPanel onComplete={(data) => {
          setCalibrationData(data)
          setGameState('customization')
        }} />
      )}
      {gameState === 'customization' && (
        <CustomizationPanel onComplete={(colors) => {
          setCustomization(colors)
          setGameState('playing')
        }} />
      )}
      {gameState === 'playing' && (
        <RunnerScene 
          calibrationData={calibrationData} 
          customization={customization} 
        />
      )}
    </div>
  )
}

export default App

