import { AppContent, REMOTE_URL } from './Content'
import {
  AppProvider,
  type ChildMethods,
  defaultBridge,
  type ParentBridge,
  type ParentMethods,
} from './Provider'

// Export for testing
export { REMOTE_URL }

// App component with optional props for dependency injection
interface AppProps {
  bridge?: ParentBridge<ParentMethods, ChildMethods>
}

function App({ bridge = defaultBridge }: AppProps) {
  return (
    <AppProvider bridge={bridge}>
      <AppContent />
    </AppProvider>
  )
}

// Export types and functions for testing
export type { ParentMethods, ChildMethods, AppProps }

export default App
