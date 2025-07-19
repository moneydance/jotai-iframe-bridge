import { AppProvider } from '../Provider'
import { AppContent } from './Content'

// App component with optional props for dependency injection
export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
