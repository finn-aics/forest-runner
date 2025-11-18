import { useState } from 'react'
import RunnerScene from './components/RunnerScene'
import CalibrationPanel from './components/CalibrationPanel'
import CustomizationPanel from './components/CustomizationPanel'

function App() {
  const [gameState, setGameState] = useState('calibration') // 'calibration' | 'customization' | 'playing'

  return (
    <div className="app">
      {gameState === 'calibration' && (
        <CalibrationPanel onComplete={() => setGameState('customization')} />
      )}
      {gameState === 'customization' && (
        <CustomizationPanel onComplete={() => setGameState('playing')} />
      )}
      {gameState === 'playing' && <RunnerScene />}
    </div>
  )
}

export default App

