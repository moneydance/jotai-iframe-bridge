# Cursor Development Rules

## 1. TypeScript & Type Safety

### Core Type Safety Principles
- **Strive for type safety but be pragmatic** - perfect types aren't always worth the cost
- **Make illegal states unrepresentable** through proper type design when practical
- **Use the type system to catch bugs at compile time, not runtime**
- **Leverage TypeScript's excellent type inference** - don't add types that don't add value

### When `any` is Acceptable
- **Third-party libraries without proper type exports** - sometimes unavoidable
- **Complex generic signatures from libraries** that are impractical to replicate
- **Interfacing with truly dynamic JavaScript** (like `JSON.parse` results from unknown sources)
- **Gradual migration** from JavaScript codebases (temporary, with plan to improve)
- **When the cost of perfect typing exceeds the benefit** - be pragmatic

### When to Add Explicit Types

#### Always Type These
- **Function parameters** - callers need to know what to pass
- **Public API return types** - consumers need to know what they get
- **Complex function signatures** where inference might be unclear
- **When inference produces `any` or overly broad types**

#### Let TypeScript Infer These
```typescript
// ✅ Good - inference keeps code clean
const users = await fetchUsers() // TypeScript infers User[]
const config = { timeout: 5000, retries: 3 } // Inferred object type
const isValid = data.length > 0 // Inferred boolean

// ❌ Unnecessary noise
const users: User[] = await fetchUsers() // fetchUsers already returns User[]
const config: { timeout: number; retries: number } = { timeout: 5000, retries: 3 }
const isValid: boolean = data.length > 0
```

### Pragmatic `any` Usage

#### Document Your `any` Usage
```typescript
// ✅ Good - documented any with reasoning
// biome-ignore lint/suspicious/noExplicitAny: lodash doesn't export proper types for this utility
const result: any = _.someComplexUtility(data)

// ✅ Good - library types are too complex to replicate
// biome-ignore lint/suspicious/noExplicitAny: complex generic from react-hook-form
const methods: any = useForm()
```

#### Contain and Convert `any`
```typescript
// ✅ Good - any contained and converted to known types
function parseApiResponse(response: any): User | null {
  // Convert any to known types at the boundary
  if (isValidUserResponse(response)) {
    return response as User
  }
  return null
}
```

### Better Alternatives to `any`

#### Use `unknown` for Truly Unknown Data
```typescript
// ✅ Good - when you really don't know the shape
function processApiResponse(data: unknown) {
  if (typeof data === 'object' && data !== null && 'result' in data) {
    return (data as { result: unknown }).result
  }
  throw new Error('Invalid API response')
}
```

#### Use Union Types for Multiple Possibilities
```typescript
// ✅ Good - when you know the possible types
function handleValue(value: string | number | boolean) {
  // TypeScript can narrow this properly
}
```

#### Use Generics for Flexible but Safe Types
```typescript
// ✅ Good - flexible but maintains type relationships
function processArray<T extends { id: string }>(items: T[]): string[] {
  return items.map(item => item.id)
}
```

#### Use Record for Dynamic Object Keys
```typescript
// ✅ Good - when object has unknown keys but known value types
function processConfig(config: Record<string, string | number | boolean>) {
  // ...
}
```

### Type Definition Best Practices

#### Use Branded Types for Critical Domain Safety
```typescript
// ✅ Good - prevents critical mix-ups (user IDs, money amounts, etc.)
type UserId = string & { readonly brand: unique symbol }
type Amount = number & { readonly brand: unique symbol }

// But don't go overboard - not every string needs to be branded
```

#### Use Discriminated Unions for State Management
```typescript
// ✅ Good - makes impossible states impossible
type LoadingState =
  | { status: 'loading' }
  | { status: 'success'; data: User }
  | { status: 'error'; error: string }
```

#### Leverage Built-in Utility Types
```typescript
// ✅ Good - use TypeScript's utilities instead of recreating
type CreateUserRequest = Pick<User, 'name' | 'email'>
type UserUpdate = Partial<Pick<User, 'name' | 'email' | 'avatar'>>
type UserPublic = Omit<User, 'password' | 'internalId'>
```

### Function Type Safety

#### Type Function Boundaries, Not Internals
```typescript
// ✅ Good - clear boundaries, inferred internals
function processUsers(users: User[]): ProcessedUser[] {
  const filtered = users.filter(u => u.active) // inferred User[]
  const mapped = filtered.map(transformUser)    // inferred ProcessedUser[]
  return mapped
}
```

#### Use Function Overloads Sparingly
```typescript
// ✅ Good - only when you have genuinely different behaviors
function createElement(tag: 'div'): HTMLDivElement
function createElement(tag: 'span'): HTMLSpanElement
function createElement(tag: string): HTMLElement
```

### Type Assertion Guidelines

#### Prefer Type Guards When Practical
```typescript
// ✅ Good - when you can reasonably validate
function isUser(value: unknown): value is User {
  return typeof value === 'object' &&
         value !== null &&
         'name' in value &&
         typeof (value as any).name === 'string'
}
```

#### Use Assertions When You Have Better Information
```typescript
// ✅ Acceptable - you know more than TypeScript can infer
const button = document.getElementById('submit-button') as HTMLButtonElement
// You just created this element, so you know its type

// ✅ Acceptable - library doesn't export the type you need
const complexLibResult = libFunction() as NeededShape
```

### Interface vs Type Guidelines

#### Use Interfaces for Extensible Object Shapes
```typescript
// ✅ Good - when extension/implementation is expected
interface User {
  id: string
  name: string
}

interface AdminUser extends User {
  permissions: string[]
}
```

#### Use Types for Everything Else
```typescript
// ✅ Good - unions, computed types, etc.
type Status = 'loading' | 'success' | 'error'
type EventHandler<T> = (event: T) => void
type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>
```

### Error Handling Types

#### Use Result/Either Patterns for Critical Flows
```typescript
// ✅ Good - for important operations where error handling matters
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E }

// But don't force this pattern everywhere - throwing is fine for many cases
```

### Advanced TypeScript Patterns

#### Type Inference from Implementation
- **Use `ReturnType<typeof factory>` to derive types from factory functions**
- **Avoid manual type duplication** - Let TypeScript infer complex types from actual implementations
- **Factory Function Types** - For complex objects, prefer inferring types from the constructor

```typescript
// ✅ Good - Type inference from implementation
function createBridgeAtoms<T>(config: Config) {
  return {
    windowAtom: atom<Window | null>(null),
    connectionAtom: atom(createDeferred<T>()),
    // ... more atoms
  }
}

// Let TypeScript infer the complex type automatically
type BridgeAtoms<T> = ReturnType<typeof createBridgeAtoms<T>>

// ❌ Avoid - Manual type duplication
interface BridgeAtoms<T> {
  windowAtom: PrimitiveAtom<Window | null>
  connectionAtom: WritableAtom<Deferred<T>, [any], void>
  // ... manually typing each property
}
```

#### Generic Type Constraints

#### Use Constraints to Enable Safe Operations
```typescript
// ✅ Good - constraint enables the operation you need
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]
}

// ✅ Good - constraint ensures shape you need
function processMethodObject<T extends Record<keyof T, (...args: any[]) => any>>(obj: T): T {
  // Can safely call methods on obj
}
```

### Type Organization

#### Co-locate Types with Related Code
- Put types in the same file/folder as the code that uses them
- Only create separate type files for truly shared types
- Export types alongside implementations when practical

#### Be Pragmatic About Type Extraction
```typescript
// ✅ Good - keep simple types inline
export function processUser(user: { id: string; name: string }): ProcessedUser {
  // ...
}

// ✅ Good - extract complex types
export interface ComplexProcessingConfig {
  // 10+ properties with complex relationships
}

export function processWithConfig(config: ComplexProcessingConfig): Result {
  // ...
}
```

## 2. Testing Guidelines

### Testing Philosophy

#### Tests Should Catch Bugs - Errors Are Good
- **Never force tests to pass by changing expectations to match broken behavior**
- Tests failing means they're doing their job - investigate the root cause
- If a test fails, either fix the code or the test logic, not the expectations
- Green tests that don't catch bugs are worse than red tests that reveal issues

#### Integration vs Unit Testing
- **Never mock files with `.integration` in the filename**
- Integration tests should test real behavior, not mocked interactions
- Unit tests can use mocks, integration tests should use real implementations
- If an integration test needs external dependencies, prefer test environments over mocks

#### Test Timeout Strategy
- Use fast timeouts (1-2 seconds) to fail quickly when things are broken
- Don't increase timeouts to "fix" failing tests - fix the underlying issue
- Fast feedback loops are more valuable than false green tests

### Test Code Writing Guidelines
*Based on Michael Lynch's "Why Good Developers Write Bad Unit Tests" (https://mtlynch.io/good-developers-bad-tests/)*

#### Core Principle: Test Code is Different from Production Code
- **Good production code is well-factored; good test code is _obvious_**
- Tests should be diagnostic tools that are simple and clear
- Don't apply production code abstractions blindly to test code

#### Keep the Reader in Your Test Function
- **The reader should understand your test without reading any other code**
- When a test breaks, developers should diagnose the problem by reading the test function top to bottom
- Avoid forcing readers to jump between files to understand test behavior

#### Embrace Test Code "Anti-Patterns"

##### Accept Redundancy for Simplicity
- **Dare to violate DRY if it supports simplicity**
- Copy/paste test setup code rather than abstract it if it makes tests clearer
- Redundancy is acceptable if it prevents obscuring test intent

##### Inline Mocks and Setup
- **Never create separate mock files** - define mocks inline within test functions
- Keep all test data and setup visible in the test function
- Example: Don't create `mockConnection.ts` - create mocks inside each test

##### Use Magic Numbers in Tests
- **Prefer magic numbers to named constants in test code**
- `expect(result).toBe(42)` is clearer than `expect(result).toBe(EXPECTED_RESULT)`
- Don't create `TEST_STARTING_VALUE = 100` - just use `100` directly

##### Write Long, Descriptive Test Names
- **Name tests so others can diagnose failures from the name alone**
- `should_return_null_when_stream_is_empty` is better than `test_next_token`
- Test names are only written once but read many times when they fail

#### Helper Methods Guidelines
- **When tempted to write test helper methods, try refactoring production code instead**
- If helpers are necessary, they should NOT:
  - Bury critical values that affect test expectations
  - Interact with the object under test
- Helpers should only extract truly irrelevant boilerplate

#### Test Organization
- Place tests in `test/` folder outside of `src/`
- Mirror the `src/` directory structure in `test/`
- Each source file should have a corresponding test file in the same relative path

#### Testing Commands
Run tests with:
```bash
npm test
# or for specific packages
cd packages/package-name && npm test
```

## 3. Code Architecture & Structure

### File and Folder Structure Guidelines
*Based on Kent C. Dodds' "Colocation" principles (https://kentcdodds.com/blog/colocation)*

#### Core Principle: Place Code as Close to Where It's Relevant as Possible
- **"Things that change together should be located as close as reasonable"**
- Maximize maintainability, applicability, and ease of use through proximity

#### Feature-Based Organization
- Group related functionality together in feature folders
- Example: `connection/` folder contains all connection-related code
- Example: `bridge/` folder contains all bridge-related code
- Example: `react/` folder contains all React-specific code

#### Benefits of Colocation
- **Maintainability**: Related files stay in sync when changes are made
- **Applicability**: Developers see the full context when making changes
- **Ease of use**: No context switching between distant file locations
- **Open Source Ready**: Features can be extracted by copying folders

#### File Structure Pattern
```
src/
├── feature-name/
│   ├── index.ts              # Feature exports
│   ├── FeatureClass.ts       # Main implementation
│   ├── helper.ts             # Feature-specific utilities
│   └── types.ts              # Feature-specific types
test/
├── feature-name/
│   ├── FeatureClass.test.ts  # Tests with inline mocks
│   └── helper.test.ts        # Utility tests
```

#### When to Break Apart Files
- If a single file becomes too large to conceptualize
- When distinct concerns emerge within a feature
- But keep related concerns in the same folder

### Type and Utility Organization

#### Type Colocation Principles
- **Colocate types with their primary consumers** - Don't create artificial `shared/types` folders
- **Type guards stay with types** - Functions like `isMessage()` belong in the same file as `Message` type
- **Move types to the module that uses them most** - e.g., `ConnectionConfig` goes in `bridge/` if bridge code is the primary consumer
- **Domain-specific interfaces belong in their domain** - `ConnectionConfig` in `bridge/types.ts`, not `shared/types.ts`

#### Utility Function Organization
- **Generic utilities** → `utils/` folder (e.g., `generateId`, `createDeferred`)
- **Domain-specific utilities used in one place** → Local helper functions at top of file
- **Don't over-export** - If a helper is only used in one file, keep it private to that file
- **Single-purpose utility files** - `utils/generateId.ts` instead of monolithic `utils/index.ts`

#### Module Structure Best Practices
- **Create focused modules** with clear boundaries (`connection/`, `bridge/`, `react/`)
- **Each module gets an `index.ts`** that re-exports everything from that module
- **Eliminate shared bloat** - Avoid monolithic `shared/` folders that become dumping grounds
- **Barrel exports for clean APIs** - Use `index.ts` files to create clean module boundaries

#### Import/Export Patterns
- **Related imports together** - When you import a type, you likely need its type guards too
- **Module-based exports** - Main `index.tsx` should export from organized modules, not individual files
- **Always use named exports, avoid default exports** - Default exports aren't named, making refactoring harder and reducing IDE support

```typescript
// ✅ Good - Named exports are explicit and refactor-friendly
export const createBridge = () => { /* ... */ }
export const Bridge = () => { /* ... */ }
export type BridgeConfig = { /* ... */ }

// Import with clear names
import { createBridge, Bridge, type BridgeConfig } from './bridge'

// ❌ Avoid - Default exports lose their names
export default function() { /* ... */ }  // What is this function called?
export default Bridge                    // Name only exists at import site

// Imports are ambiguous and harder to refactor
import SomeArbitraryName from './bridge'  // Could be anything
import Bridge from './bridge'             // Name doesn't survive refactoring
```

#### Anti-Patterns to Avoid
```typescript
// ❌ Don't create artificial separation
shared/types.ts    // All types mixed together
shared/utils.ts    // All utilities mixed together

// ✅ Do colocate with primary usage
connection/types.ts        // Connection types + type guards
connection/proxy.ts        // With local formatMethodPath() helper
bridge/types.ts           // Bridge-specific types like ConnectionConfig
utils/generateId.ts       // Generic utilities only
```

#### Exceptions to Colocation
- Documentation spanning multiple features goes at appropriate folder level
- End-to-end tests that span the entire system go at project root
- **Only truly generic utilities** that are used across many features go in `utils/` folder

### Function Decomposition Guidelines
- **Decompose for clarity, not just size** - Split functions when they have distinct responsibilities
- **Avoid unnecessary wrapper functions** - Don't create wrappers just to reduce line count
- **Natural breakpoints matter** - Split at logical boundaries (setup, processing, cleanup)
- **Consider the call site** - Would the caller benefit from direct access to sub-functions?

```typescript
// ✅ Good - Logical decomposition
function createBridge() {
  const atoms = createBridgeAtoms() // Logical unit: atom setup
  const cleanup = createEffect()    // Logical unit: effect management

  return { // Direct implementation - no unnecessary wrapper
    connect: () => { /* logic */ },
    destroy: () => { /* logic */ }
  }
}

// ❌ Avoid - Unnecessary wrapper
function createBridge() {
  const atoms = createBridgeAtoms()
  const cleanup = createEffect()

  // Pointless wrapper function
  return createBridgeImplementation(atoms, cleanup)
}
```

### Refactoring Guidelines
- **Colocation beats categorization** - Put code where it's used, not where it "belongs" abstractly
- **Break apart monolithic files** by feature/responsibility, not by code type
- **Move types before refactoring logic** - Establish clean type boundaries first
- **Test after each major move** - Ensure builds and tests pass between changes
- **Question every abstraction** - Each wrapper function should add genuine value

### Architecture Decisions
- Use Jotai reactive patterns over manual state management
- Prefer declarative over imperative approaches
- Eliminate race conditions through proper state synchronization

## 4. Code Style & Patterns

### Modern ES6+ Patterns
- **Use optional chaining (`?.`)** to safely access nested properties
- **Use nullish coalescing (`??`)** for default values when dealing with `null`/`undefined`
- **Prefer template literals** over string concatenation
- **Use destructuring** for cleaner variable assignments, unless namespacing via an object is required to avoid variable name collisions
- **Use spread syntax** for array/object operations

```typescript
// ✅ Good - Modern ES6+ patterns
const userName = user?.profile?.name ?? 'Anonymous'
const config = { ...defaultConfig, ...userConfig }
const [first, ...rest] = items
const message = `Welcome ${userName}!`

// ❌ Avoid - Old patterns
const userName = user && user.profile && user.profile.name || 'Anonymous'
const config = Object.assign({}, defaultConfig, userConfig)
const message = 'Welcome ' + userName + '!'
```

### Async/Await Preferences
- **Prefer `async/await`** over raw Promise chains for better readability
- **Use Promise.all()** for concurrent operations
- **Handle errors with try/catch** in async functions

```typescript
// ✅ Good - Clean async/await
async function fetchUserData(id: string) {
  try {
    const [user, permissions] = await Promise.all([
      fetchUser(id),
      fetchPermissions(id)
    ])
    return { user, permissions }
  } catch (error) {
    console.error('Failed to fetch user data:', error)
    throw error
  }
}

// ❌ Avoid - Promise chains
function fetchUserData(id: string) {
  return fetchUser(id)
    .then(user => fetchPermissions(id).then(permissions => ({ user, permissions })))
    .catch(error => { console.error('Failed:', error); throw error; })
}
```

### Code Denesting and Guard Patterns
- **Use early returns** to reduce nesting levels
- **Guard clauses** at the start of functions
- **Avoid deeply nested if/else** chains
- **Use `safeAssignment` pattern** to denest try/catch blocks (only wrap code that might throw)

```typescript
// ✅ Good - Early returns and guard clauses
function processUser(user: User | null): ProcessedUser | null {
  if (!user) return null
  if (!user.isActive) return null
  if (!user.permissions?.length) return null

  return {
    id: user.id,
    name: user.name,
    permissions: user.permissions
  }
}

// ✅ Good - safeAssignment pattern (only wrap operations that might throw)
import { safeAssignment } from '../utils'

async function fetchData(url: string) {
  // Only wrap the fetch operation that might throw
  const [ok, error, data] = await safeAssignment(() => fetch(url))
  if (!ok) {
    console.error('Fetch failed:', error)
    return null
  }

  // Only wrap the .json() parsing that might throw
  const [jsonOk, parseError, json] = await safeAssignment(() => data.json())
  if (!jsonOk) {
    console.error('Parse failed:', parseError)
    return null
  }

  // Don't wrap safe operations like simple assignments or logging
  const processedData = { timestamp: Date.now(), data: json }
  console.log('Data fetched successfully')

  return processedData
}

// ❌ Avoid - Nested conditions and try/catch
function processUser(user: User | null): ProcessedUser | null {
  if (user) {
    if (user.isActive) {
      if (user.permissions && user.permissions.length > 0) {
        return {
          id: user.id,
          name: user.name,
          permissions: user.permissions
        }
      }
    }
  }
  return null
}

// ❌ Avoid - Nested try/catch
async function fetchData(url: string) {
  try {
    const data = await fetch(url)
    try {
      const json = await data.json()
      return json
    } catch (parseError) {
      console.error('Parse failed:', parseError)
      return null
    }
  } catch (fetchError) {
    console.error('Fetch failed:', fetchError)
    return null
  }
}
```

### General Formatting
- **Use meaningful variable names** - `userName` not `un`
- **Keep functions small** - Ideally under 40 lines
- **Single responsibility** - Each function should do one thing well
- **Consistent naming** - `camelCase` for variables/functions, `PascalCase` for types/components

## 5. Development Process

### Analyze Before Acting
- **Always identify and describe issues before implementing solutions**
- List potential solutions with pros/cons before choosing one
- Explain the root cause, not just the symptoms
- Consider multiple approaches before coding

### Code Changes
- Prefer editing existing files over creating new ones
- Make atomic, focused changes, large refactors are okay but verify with me and provide options before making them
- Use parallel tool calls when gathering information
- Validate fixes with tests after implementation

### Communication
- Explain technical decisions clearly
- Use specific examples when describing issues
- Provide context for why changes are needed
- Never say "comprehensive" - be specific about what's included

### Error Handling
- Don't suppress or work around errors - fix them
- Investigate TypeScript errors properly before adding type assertions
- Use proper error boundaries and cleanup in React components
- Log meaningful information for debugging

### Performance
- Prefer reactive state updates over polling
- Use proper cleanup in effects and event listeners
- Minimize re-renders through proper dependency arrays
- Consider lazy loading for non-critical features
