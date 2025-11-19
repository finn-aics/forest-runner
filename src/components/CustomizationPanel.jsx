import { useState } from 'react'

function CustomizationPanel({ onComplete }) {
  const [shirtColor, setShirtColor] = useState('#ff0000')
  const [hairColor, setHairColor] = useState('#8b4513')
  const [skinColor, setSkinColor] = useState('#fdbcb4')

  const handleStart = () => {
    onComplete({ shirtColor, hairColor, skinColor })
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
      <h1>Character Customization</h1>
      
      <div style={{ margin: '20px' }}>
        <label>Shirt Color: </label>
        <input 
          type="color" 
          value={shirtColor}
          onChange={(e) => setShirtColor(e.target.value)}
        />
      </div>
      
      <div style={{ margin: '20px' }}>
        <label>Hair Color: </label>
        <input 
          type="color" 
          value={hairColor}
          onChange={(e) => setHairColor(e.target.value)}
        />
      </div>
      
      <div style={{ margin: '20px' }}>
        <label>Skin Color: </label>
        <input 
          type="color" 
          value={skinColor}
          onChange={(e) => setSkinColor(e.target.value)}
        />
      </div>

      <button onClick={handleStart}>Start Game</button>
    </div>
  )
}

export default CustomizationPanel

