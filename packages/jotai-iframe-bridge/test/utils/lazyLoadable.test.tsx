import { atom, getDefaultStore } from 'jotai'
import { beforeEach, describe, expect, it } from 'vitest'
import { lazyLoadable } from '../../src/utils/lazyLoadable'

describe('LazyLoadable', () => {
  let store: ReturnType<typeof getDefaultStore>

  beforeEach(() => {
    store = getDefaultStore()
  })

  it('should start in uninitialized state when promise is null', () => {
    const promiseAtom = atom<Promise<string> | null>(null)
    const loadableAtom = lazyLoadable(promiseAtom)

    const loadable = store.get(loadableAtom)

    expect(loadable.state).toBe('uninitialized')
    // In uninitialized state, there are no data or error properties
  })

  it('should transition to loading state when promise is provided', () => {
    const promiseAtom = atom<Promise<string> | null>(null)
    const loadableAtom = lazyLoadable(promiseAtom)

    // Initial state
    const initial = store.get(loadableAtom)
    expect(initial.state).toBe('uninitialized')

    // Set a pending promise
    const pendingPromise = new Promise<string>(() => {}) // Never resolves
    store.set(promiseAtom, pendingPromise)

    // Should transition to loading
    const loading = store.get(loadableAtom)
    expect(loading.state).toBe('loading')
    // In loading state, there are no data or error properties
  })

  it('should transition to hasData state when promise resolves', async () => {
    const promiseAtom = atom<Promise<string> | null>(null)
    const loadableAtom = lazyLoadable(promiseAtom)

    // Track state changes
    let evaluationCount = 0
    const trackingAtom = atom((get) => {
      evaluationCount++
      const loadable = get(loadableAtom)
      const data = loadable.state === 'hasData' ? loadable.data : undefined
      console.log(
        `📊 LazyLoadable evaluation #${evaluationCount}: state=${loadable.state}, data=${data}`
      )
      return loadable
    })

    // Initial state
    const initial = store.get(trackingAtom)
    expect(initial.state).toBe('uninitialized')
    expect(evaluationCount).toBe(1)

    // Set a resolving promise
    const testData = 'resolved data'
    const resolvingPromise = Promise.resolve(testData)
    store.set(promiseAtom, resolvingPromise)

    // Should be in loading state
    const loading = store.get(trackingAtom)
    expect(loading.state).toBe('loading')
    expect(evaluationCount).toBe(2)

    // Wait for promise to resolve
    await resolvingPromise

    // Force re-evaluation by waiting a tick for promise resolution
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Should transition to hasData
    const resolved = store.get(trackingAtom)
    expect(resolved.state).toBe('hasData')
    if (resolved.state === 'hasData') {
      expect(resolved.data).toBe(testData)
    }
    console.log(`🧪 Final evaluation count: ${evaluationCount}`)
  })

  it('should transition to hasError state when promise rejects', async () => {
    const promiseAtom = atom<Promise<string> | null>(null)
    const loadableAtom = lazyLoadable(promiseAtom)

    // Set a rejecting promise
    const testError = new Error('Test error')
    const rejectingPromise = Promise.reject(testError)
    store.set(promiseAtom, rejectingPromise)

    // Should be in loading state
    const loading = store.get(loadableAtom)
    expect(loading.state).toBe('loading')

    // Wait for promise to reject
    try {
      await rejectingPromise
    } catch {
      // Expected
    }

    // Force re-evaluation by waiting a tick
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Should transition to hasError
    const errored = store.get(loadableAtom)
    expect(errored.state).toBe('hasError')
    if (errored.state === 'hasError') {
      expect(errored.error).toBe(testError)
    }
  })

  it('should handle promise transitions reactively', async () => {
    const promiseAtom = atom<Promise<string> | null>(null)
    const loadableAtom = lazyLoadable(promiseAtom)

    let evaluationCount = 0
    const trackingAtom = atom((get) => {
      evaluationCount++
      const loadable = get(loadableAtom)
      console.log(`📊 Promise transition #${evaluationCount}: state=${loadable.state}`)
      return loadable
    })

    // Start with null
    const initial = store.get(trackingAtom)
    expect(initial.state).toBe('uninitialized')
    expect(evaluationCount).toBe(1)

    // Set first promise
    const promise1 = Promise.resolve('data1')
    store.set(promiseAtom, promise1)

    const loading1 = store.get(trackingAtom)
    expect(loading1.state).toBe('loading')
    expect(evaluationCount).toBe(2)

    // Wait for resolution
    await promise1
    await new Promise((resolve) => setTimeout(resolve, 0))

    const resolved1 = store.get(trackingAtom)
    expect(resolved1.state).toBe('hasData')
    if (resolved1.state === 'hasData') {
      expect(resolved1.data).toBe('data1')
    }

    // Set second promise (should trigger re-evaluation)
    const promise2 = Promise.resolve('data2')
    store.set(promiseAtom, promise2)

    const loading2 = store.get(trackingAtom)
    expect(loading2.state).toBe('loading')

    // Wait for second resolution
    await promise2
    await new Promise((resolve) => setTimeout(resolve, 0))

    const resolved2 = store.get(trackingAtom)
    expect(resolved2.state).toBe('hasData')
    if (resolved2.state === 'hasData') {
      expect(resolved2.data).toBe('data2')
    }

    console.log(`🧪 Total evaluations for promise transitions: ${evaluationCount}`)
    expect(evaluationCount).toBeGreaterThan(3) // Should have re-evaluated multiple times
  })

  it('should handle null to promise to null transitions', async () => {
    const promiseAtom = atom<Promise<string> | null>(null)
    const loadableAtom = lazyLoadable(promiseAtom)

    // null -> promise
    const promise = Promise.resolve('test data')
    store.set(promiseAtom, promise)

    const loading = store.get(loadableAtom)
    expect(loading.state).toBe('loading')

    await promise
    await new Promise((resolve) => setTimeout(resolve, 0))

    const resolved = store.get(loadableAtom)
    expect(resolved.state).toBe('hasData')
    if (resolved.state === 'hasData') {
      expect(resolved.data).toBe('test data')
    }

    // promise -> null (should reset to uninitialized)
    store.set(promiseAtom, null)

    const reset = store.get(loadableAtom)
    expect(reset.state).toBe('uninitialized')
    // In uninitialized state, there are no data or error properties
  })

  it('should be reactive when used in derived atoms', async () => {
    const promiseAtom = atom<Promise<number> | null>(null)
    const loadableAtom = lazyLoadable(promiseAtom)

    // Create a derived atom that depends on loadable state
    const isReadyAtom = atom((get) => {
      const loadable = get(loadableAtom)
      return loadable.state === 'hasData'
    })

    // Initially not ready
    expect(store.get(isReadyAtom)).toBe(false)

    // Set promise
    const promise = Promise.resolve(42)
    store.set(promiseAtom, promise)

    // Still not ready (loading)
    expect(store.get(isReadyAtom)).toBe(false)

    // Wait for resolution
    await promise
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Now should be ready
    expect(store.get(isReadyAtom)).toBe(true)
  })
})
