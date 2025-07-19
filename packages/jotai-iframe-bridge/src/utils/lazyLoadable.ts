import type { Atom } from 'jotai'
import { atom } from 'jotai'
import type { Loadable } from 'jotai/vanilla/utils/loadable'

export type LazyLoadable<Value> =
  | { state: 'uninitialized' }
  | { state: 'loading' }
  | { state: 'hasError'; error: unknown }
  | { state: 'hasData'; data: Awaited<Value> }

// Memoization cache to ensure one atom per input atom (like Jotai's memo1)
const cache1 = new WeakMap()
const memo1 = <T>(create: () => T, dep1: object): T =>
  cache1.has(dep1) ? cache1.get(dep1) : cache1.set(dep1, create()).get(dep1)

let createdAtomCount = 0

export function lazyLoadable<Value>(
  promiseAtom: Atom<Promise<Value> | null>
): Atom<LazyLoadable<Value>> {
  return memo1(() => {
    createdAtomCount++
    console.log(`🧠 LazyLoadable: Created atom #${createdAtomCount} for`, promiseAtom)

    // Create a loadable cache for this specific lazyLoadable instance
    const loadableCache = new WeakMap<Promise<Value>, Loadable<Value>>()
    const refreshAtom = atom(0)

    const derivedAtom = atom(
      (get, { setSelf }) => {
        get(refreshAtom) // Subscribe to refresh

        const promiseOrNull = get(promiseAtom)

        // Handle null case (uninitialized state)
        if (promiseOrNull === null) {
          return { state: 'uninitialized' } as LazyLoadable<Value>
        }

        // Handle promise case - use loadable logic
        const promise = promiseOrNull

        // Check cache first
        const cached1 = loadableCache.get(promise)
        if (cached1) {
          return cached1 as LazyLoadable<Value>
        }

        // Set up promise handlers
        promise.then(
          (data) => {
            loadableCache.set(promise, { state: 'hasData', data: data as Awaited<Value> })
            setSelf() // Trigger re-evaluation
          },
          (error) => {
            loadableCache.set(promise, { state: 'hasError', error })
            setSelf() // Trigger re-evaluation
          }
        )

        // Check cache again (might have been set synchronously)
        const cached2 = loadableCache.get(promise)
        if (cached2) {
          return cached2 as LazyLoadable<Value>
        }

        // Set loading state and return it
        const loadingState = { state: 'loading' } as LazyLoadable<Value>
        loadableCache.set(promise, loadingState as Loadable<Value>)
        return loadingState
      },
      (_get, set) => {
        // Refresh function
        set(refreshAtom, (c) => c + 1)
      }
    )

    return atom((get) => get(derivedAtom))
  }, promiseAtom)
}
