function CustomizationPanel({ onComplete }) {
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
        <input type="color" defaultValue="#ff0000" />
      </div>
      
      <div style={{ margin: '20px' }}>
        <label>Hair Color: </label>
        <input type="color" defaultValue="#8b4513" />
      </div>
      
      <div style={{ margin: '20px' }}>
        <label>Skin Color: </label>
        <input type="color" defaultValue="#fdbcb4" />
      </div>

      <button onClick={onComplete}>Start Game</button>
      {/* TODO: Store customization choices */}
    </div>
  )
}

export default CustomizationPanel

