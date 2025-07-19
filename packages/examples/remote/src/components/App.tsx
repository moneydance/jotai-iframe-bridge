import { AppProvider } from '../Provider'
import { AppContent } from './Content'

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
