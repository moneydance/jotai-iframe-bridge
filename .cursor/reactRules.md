# React Development Rules

## 1. Component Definition Patterns

### **Function Declarations Over Arrow Functions**

**Always use function declarations for React components:**

```typescript
// ✅ Preferred - Function declaration
export function MyComponent({ title }: { title: string }) {
  return <div>{title}</div>
}

// ❌ Avoid - Arrow function
export const MyComponent = ({ title }: { title: string }) => {
  return <div>{title}</div>
}
```

**Key Advantages:**
- **Hoisting** - Functions can be called before they're defined
- **Easier abstractions** - Simpler to refactor and extract logic
- **Generic compatibility** - No TSX parsing conflicts with generics
- **Debugging** - Better stack traces and displayName handling
- **Consistency** - Matches our general function declaration preference

### **Generic Components in TSX**

**CRITICAL: Always use function declarations for generic components to avoid TSX parsing conflicts:**

```typescript
// ✅ Preferred - No TSX parsing issues
function GenericComponent<T extends Record<string, any>>(props: {
  data: T
  onSelect: (item: T) => void
}) {
  return <div>{/* component logic */}</div>
}

// ❌ Problematic - TSX parser may confuse <T> with JSX
const GenericComponent = <T extends Record<string, any>>(props: {
  data: T
  onSelect: (item: T) => void
}) => {
  return <div>{/* component logic */}</div>
}

// ❌ Even worse - Requires workarounds
const GenericComponent = <T,>(props: { data: T }) => {
  // Trailing comma hack to help parser
}
```

## 2. Component Architecture & Colocation

### **Colocation Over Premature Abstraction**

**CRITICAL: Only extract components and hooks when they're used in multiple places. Keep single-use components and hooks colocated in the same file.**

```typescript
// ✅ EXCELLENT - Single-use components colocated
function AppContent() {
  const [result, setResult] = useState<number | null>(null)
  const connection = useConnection()

  // ✅ Local hook - only used in this component
  function useCalculationState() {
    const [numberA, setNumberA] = useState(10)
    const [numberB, setNumberB] = useState(5)
    const [isCalculating, setIsCalculating] = useState(false)

    return { numberA, setNumberA, numberB, setNumberB, isCalculating, setIsCalculating }
  }

  // ✅ Local component - only used in this file
  function ConnectionStatusIndicator({ state }: { state: LoadableState }) {
    const statusConfig = {
      hasData: { bg: 'bg-green-500', text: 'connected' },
      loading: { bg: 'bg-yellow-500', text: 'connecting' },
      hasError: { bg: 'bg-red-500', text: 'error' },
    }

    const config = statusConfig[state] || { bg: 'bg-red-500', text: 'disconnected' }

    return (
      <span className={`px-3 py-1 rounded-full text-white text-sm ${config.bg}`}>
        {config.text}
      </span>
    )
  }

  // ✅ Local component - calculation form only used here
  function CalculationForm() {
    const { numberA, setNumberA, numberB, setNumberB } = useCalculationState()

    const handleCalculate = async () => {
      // calculation logic
    }

    return (
      <div className="space-y-4">
        <input
          type="number"
          value={numberA}
          onChange={(e) => setNumberA(Number(e.target.value))}
        />
        <input
          type="number"
          value={numberB}
          onChange={(e) => setNumberB(Number(e.target.value))}
        />
        <button onClick={handleCalculate}>Calculate</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <h1>Calculator App</h1>
      <ConnectionStatusIndicator state={connection.state} />
      <CalculationForm />
      {result && <div>Result: {result}</div>}
    </div>
  )
}

// ❌ BAD - Unnecessarily extracted single-use components
export function ConnectionStatusIndicator({ state }: { state: LoadableState }) {
  // Only used in AppContent - should be colocated
}

export function CalculationForm({ onCalculate }: { onCalculate: () => void }) {
  // Only used in AppContent - should be colocated
}

// ❌ BAD - Unnecessarily extracted single-use hook
export function useCalculationState() {
  // Only used in AppContent - should be colocated
}
```

### **When to Extract vs Colocate**

```typescript
// ✅ EXTRACT - Used in multiple components
export function Button({ title, onClick }: ButtonProps) {
  return <button onClick={onClick}>{title}</button>
}

export function useApiCall<T>(url: string) {
  // Used across multiple components - worth extracting
}

// ✅ COLOCATE - Single use in parent component
function UserProfile() {
  // ✅ Local hook - only needed in UserProfile
  function useProfileData() {
    const [profile, setProfile] = useState(null)
    // profile-specific logic
    return { profile, setProfile }
  }

  // ✅ Local component - only needed in UserProfile
  function AvatarUpload({ onUpload }: { onUpload: (file: File) => void }) {
    return <input type="file" onChange={(e) => onUpload(e.target.files?.[0]!)} />
  }

  const { profile } = useProfileData()

  return (
    <div>
      <h1>{profile?.name}</h1>
      <AvatarUpload onUpload={handleAvatarUpload} />
    </div>
  )
}
```

### **Component Decomposition Guidelines**

**Break down components when they exceed ~40 lines OR handle multiple concerns, but keep single-use pieces colocated:**

```typescript
// ✅ Good - Logical decomposition with colocation
function UserDashboard() {
  // ✅ Local state hook
  function useDashboardState() {
    const [activeTab, setActiveTab] = useState('profile')
    const [notifications, setNotifications] = useState([])
    return { activeTab, setActiveTab, notifications, setNotifications }
  }

  // ✅ Local component - tab navigation only used here
  function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
    const tabs = ['profile', 'settings', 'billing']

    return (
      <nav className="flex space-x-4">
        {tabs.map(tab => (
          <button
            key={tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>
    )
  }

  // ✅ Local component - content display only used here
  function TabContent({ activeTab }: { activeTab: string }) {
    switch (activeTab) {
      case 'profile': return <ProfileContent />  // ← These ARE reused
      case 'settings': return <SettingsContent />
      case 'billing': return <BillingContent />
      default: return null
    }
  }

  const { activeTab, setActiveTab } = useDashboardState()

  return (
    <div>
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <TabContent activeTab={activeTab} />
    </div>
  )
}
```

### **File Organization Strategy**

```
src/
├── components/              # ONLY multi-use components
│   ├── Button.tsx           # Used across app
│   ├── Modal.tsx            # Used across app
│   └── index.ts             # Barrel exports
├── hooks/                   # ONLY multi-use hooks
│   ├── useApi.ts            # Used across app
│   ├── useAuth.ts           # Used across app
│   └── index.ts             # Barrel exports
└── shared/                  # Shared utilities/types and pages
    ├── types.ts             # App-wide types
    ├── utils.ts             # App-wide utilities
    └── pages/               # Page components with colocated helpers
        ├── UserDashboard.tsx    # Contains local TabNavigation, TabContent
        ├── Calculator.tsx       # Contains local CalculationForm, StatusIndicator
        └── Profile.tsx          # Contains local AvatarUpload, ProfileEditor
```

## 3. Props and Type Patterns

### **Props Type Definitions**

**Use types (not interfaces) for props, colocated with components:**

```typescript
// ✅ Preferred - Type definition colocated with component
type ConnectionStatusProps = {
  state: LoadableState
  className?: string
}

function ConnectionStatus({ state, className = '' }: ConnectionStatusProps) {
  // component logic
}

// ✅ Even better - Inline for single-use components
function AppContent() {
  function LocalStatusIndicator({
    state,
    onRetry
  }: {
    state: LoadableState
    onRetry: () => void
  }) {
    // Only used in AppContent - inline type is perfect
  }
}

// ❌ Avoid - Interface for simple props
interface ConnectionStatusProps {
  state: LoadableState
  className?: string
}
```

### **Props Destructuring Patterns**

```typescript
// ✅ Good - Destructure with defaults
function Button({
  title,
  disabled = false,
  variant = 'primary',
  onClick
}: ButtonProps) {
  // logic
}

// ✅ Good - Rest props for extensibility
function Input({
  label,
  error,
  ...inputProps
}: InputProps & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label>{label}</label>
      <input {...inputProps} />
      {error && <span>{error}</span>}
    </div>
  )
}
```

## 4. State Management Patterns

### **Local State with useState**

```typescript
// ✅ Good - Descriptive state names with auxiliary verbs
function Calculator() {
  const [isCalculating, setIsCalculating] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [result, setResult] = useState<number | null>(null)

  // prefer early returns for state checks
  if (hasError) return <ErrorDisplay />
  if (isCalculating) return <LoadingSpinner />

  return <CalculatorForm />
}
```

### **Custom Hooks - Extract Only When Reused**

```typescript
// ✅ GOOD - Custom hook used across multiple components
export function useBridgeConnection() {
  const bridge = useBridge()
  const connection = useConnection()
  const remoteProxy = useRemoteProxy()

  return {
    bridge,
    connection,
    remoteProxy,
    isConnected: connection.state === 'hasData',
    isLoading: connection.state === 'loading',
  }
}

// ✅ GOOD - Local hook colocated with single user
function AppContent() {
  // ✅ Local hook - only used in this component
  function useCalculationForm() {
    const [numberA, setNumberA] = useState(10)
    const [numberB, setNumberB] = useState(5)
    const [result, setResult] = useState<number | null>(null)

    const handleCalculate = async () => {
      const [ok, error, calculationResult] = await safeAssignment(() =>
        performCalculation(numberA, numberB)
      )

      if (!ok) {
        console.error('Calculation failed:', error)
        return
      }

      setResult(calculationResult)
    }

    return { numberA, setNumberA, numberB, setNumberB, result, handleCalculate }
  }

  const { numberA, setNumberA, numberB, setNumberB, result, handleCalculate } = useCalculationForm()

  return (
    <div>
      <input value={numberA} onChange={(e) => setNumberA(Number(e.target.value))} />
      <input value={numberB} onChange={(e) => setNumberB(Number(e.target.value))} />
      <button onClick={handleCalculate}>Calculate</button>
      {result && <div>Result: {result}</div>}
    </div>
  )
}

// ❌ BAD - Extracted hook that's only used once
export function useCalculationForm() {
  // This should be colocated in AppContent
}
```

## 5. Event Handling Patterns

### **Event Handler Naming and Definition**

```typescript
// ✅ Good - Clear handler names with handle prefix
function ContactForm() {
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    // submit logic
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value)
  }

  const handleAsyncAction = async () => {
    const [ok, error, result] = await safeAssignment(() =>
      submitData(formData)
    )

    if (!ok) {
      setError(error)
      return
    }

    onSuccess(result)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input onChange={handleInputChange} />
      <button type="button" onClick={handleAsyncAction}>
        Submit
      </button>
    </form>
  )
}
```

### **useCallback Usage**

```typescript
// ✅ Good - useCallback for expensive operations or child optimization
function ParentComponent() {
  const handleExpensiveOperation = useCallback((data: ComplexData) => {
    // expensive calculation or API call
    return processComplexData(data)
  }, [dependency])

  // ✅ Good - For refs that need to be stable
  const handleIframeRef = useCallback((element: HTMLIFrameElement | null) => {
    if (element?.contentWindow) {
      bridge.connect(element.contentWindow)
    }
  }, [bridge])

  return (
    <div>
      <iframe ref={handleIframeRef} />
      <ExpensiveChild onProcess={handleExpensiveOperation} />
    </div>
  )
}
```

## 6. Error Handling in React


```

### **Async Error Handling with safeAssignment**

```typescript
// ✅ Good - safeAssignment for async operations
function DataFetcher() {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)

    const [ok, fetchError, result] = await safeAssignment(() =>
      api.fetchUserData()
    )

    setIsLoading(false)

    if (!ok) {
      setError(`Failed to fetch data: ${fetchError}`)
      return
    }

    setData(result)
  }

  // Component render logic
}
```

## 7. Performance Optimization

### **Memoization Patterns**

```typescript
// ✅ Good - memo for expensive renders (reusable component)
export const ExpensiveComponent = memo(function ExpensiveComponent({
  data,
  onUpdate
}: ExpensiveComponentProps) {
  // expensive rendering logic
  return <ComplexVisualization data={data} />
})

// ✅ Good - useMemo for expensive calculations
function DataProcessor({ rawData }: { rawData: RawData[] }) {
  const processedData = useMemo(() => {
    return rawData
      .filter(item => item.isValid)
      .map(item => transformData(item))
      .sort((a, b) => a.priority - b.priority)
  }, [rawData])

  return <DataTable data={processedData} />
}
```

## 8. Testing Best Practices

### **Component Testing Patterns**

```typescript
// ✅ Good - Test component behavior, not implementation
describe('CalculationSection', () => {
  test('performs calculation when button is clicked', async () => {
    const user = userEvent.setup()
    const mockOnCalculate = vi.fn()

    render(
      <CalculationSection
        numberA={10}
        numberB={5}
        onCalculate={mockOnCalculate}
        isConnected={true}
      />
    )

    // Test user interaction
    await user.click(screen.getByRole('button', { name: /calculate/i }))

    expect(mockOnCalculate).toHaveBeenCalledWith(10, 5)
  })

  test('disables calculate button when not connected', () => {
    render(
      <CalculationSection
        numberA={10}
        numberB={5}
        onCalculate={vi.fn()}
        isConnected={false}
      />
    )

    expect(screen.getByRole('button', { name: /calculate/i })).toBeDisabled()
  })
})
```

## 9. Export Patterns

### **Selective Export Strategy**

```typescript
// ✅ Preferred - Named exports ONLY for reusable components
export function Button({ title, onClick }: ButtonProps) {
  return <button onClick={onClick}>{title}</button>
}

export function Modal({ children, isOpen }: ModalProps) {
  if (!isOpen) return null
  return <div className="modal">{children}</div>
}

// ✅ Main component that contains colocated helpers
export function AppContent() {
  // ✅ NOT exported - only used internally
  function LocalHelper() {
    return <div>Helper</div>
  }

  // ✅ NOT exported - only used internally
  function useLocalState() {
    return useState()
  }

  return <div><LocalHelper /></div>
}

// ✅ Default export only for main App component
function App() {
  return <AppProvider><AppContent /></AppProvider>
}

export default App
```

### **Barrel Exports for Reusable Components Only**

```typescript
// src/components/index.ts - ONLY truly reusable components
export { Button } from './Button'
export { Modal } from './Modal'
export { Input } from './Input'
export type { ButtonProps, ModalProps, InputProps } from './types'

// Usage
import { Button, Modal, type ButtonProps } from '../components'
```

## 10. Anti-Patterns to Avoid

### **Common React Anti-Patterns**

```typescript
// ❌ Avoid - Arrow functions for components
const Component = () => <div />

// ❌ Avoid - Creating objects/functions in render
function App() {
  return <Child style={{ margin: 10 }} onClick={() => doSomething()} />
}

// ❌ Avoid - Extracting single-use components
export function OnlyUsedInOnePlace() {
  // Should be colocated in the component that uses it
}

// ❌ Avoid - Extracting single-use hooks
export function useOnlyCalledOnce() {
  // Should be defined inside the component that uses it
}

// ❌ Avoid - Too many props
function OverloadedComponent({
  prop1, prop2, prop3, prop4, prop5, prop6, prop7, prop8
}: ManyProps) {}

// ❌ Avoid - Generic components with arrow functions in TSX
const Generic = <T>(props: { data: T }) => <div />

// ❌ Avoid - Interfaces for simple props
interface SimpleProps {
  title: string
}
```

## 11. File Naming Conventions

```
src/
├── components/              # ONLY multi-use components
│   ├── Button.tsx           # Used in 3+ places
│   ├── Modal.tsx            # Used in 3+ places
│   └── index.ts            # Barrel export
├── hooks/                   # ONLY multi-use hooks
│   ├── useApi.ts           # Used in 3+ places
│   └── index.ts            # Barrel export
└── shared/                  # Shared utilities/types and pages
    ├── types.ts            # App-wide types
    ├── utils.ts            # App-wide utilities
    ├── component-types.ts  # For reusable components only
    └── pages/               # Components with colocated helpers
        ├── Dashboard.tsx        # Contains local components/hooks
        ├── Profile.tsx          # Contains local components/hooks
        └── Calculator.tsx       # Contains local components/hooks
```

## 12. Colocation Decision Tree

**Before extracting a component or hook, ask:**

1. **Is it used in more than one component?**
   - **Yes** → Extract to separate file and export
   - **No** → Keep colocated, don't export

2. **Is it likely to be reused in the future?**
   - **Yes** → Consider extracting (but prefer waiting until actual reuse)
   - **No** → Keep colocated

3. **Is the parent component becoming too large (>40 lines)?**
   - **Yes** → Break down with colocated components first
   - **No** → Keep as single component

4. **Does the helper have complex logic that deserves testing in isolation?**
   - **Yes** → Consider extracting for testability
   - **No** → Test through parent component

**Remember: Colocation is reversible, premature abstraction is not. Start colocated, extract only when you have real reuse.**

These rules prioritize **maintainability**, **simplicity**, and **discoverability** while avoiding premature abstractions. The emphasis on colocation keeps related code together until there's a proven need for extraction.
