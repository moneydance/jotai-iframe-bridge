import { AppContent } from './Content'
import { AppProvider } from './Provider'

// App component with optional props for dependency injection
function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

export default App
