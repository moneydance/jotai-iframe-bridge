/**
 * Simple Hello World component
 */
export function HelloWorld() {
  return (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#f0f8ff',
        borderRadius: '8px',
        border: '2px solid #4169e1',
        textAlign: 'center',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <h1 style={{ color: '#4169e1', margin: '0 0 10px 0' }}>Hello World! 👋</h1>
      <p style={{ color: '#666', margin: 0 }}>Welcome to the Jotai Iframe Bridge library</p>
    </div>
  )
}

export default HelloWorld
