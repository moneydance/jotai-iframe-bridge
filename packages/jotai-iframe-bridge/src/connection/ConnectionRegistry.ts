import type { Atom } from 'jotai'
import { atom, getDefaultStore } from 'jotai'
import type { ConnectionSession } from './ConnectionSession'

/**
 * Global registry for managing connection sessions to prevent duplicates
 * and provide automatic cleanup when windows are garbage collected.
 */
export class ConnectionRegistry {
  private registry = new WeakMap<Window, ConnectionSession<any, any>>()
  private cleanupRegistry = new FinalizationRegistry((session: ConnectionSession<any, any>) => {
    try {
      session.destroy()
    } catch (_error) {
      // Session might already be destroyed, ignore errors
    }
  })
  private windowAtoms = new WeakMap<Window, Atom<ConnectionSession<any, any> | null>>()
  private globalVersionAtom = atom(0)
  private store = getDefaultStore()

  /**
   * Get a reactive atom for a specific window's session
   */
  get(targetWindow: Window): Atom<ConnectionSession<any, any> | null> {
    let windowAtom = this.windowAtoms.get(targetWindow)
    if (windowAtom) {
      return windowAtom
    }

    // Create reactive atom that depends on global version
    windowAtom = atom((get) => {
      get(this.globalVersionAtom) // Subscribe to any registry changes
      return this.registry.get(targetWindow) || null
    })

    this.windowAtoms.set(targetWindow, windowAtom)
    return windowAtom
  }

  /**
   * Get existing session or create a new one using the provided factory, returns reactive atom
   */
  getOrCreate<
    TLocalMethods extends Record<keyof TLocalMethods, (...args: any[]) => any>,
    TRemoteMethods extends Record<keyof TRemoteMethods, (...args: any[]) => any>,
  >(
    targetWindow: Window,
    sessionFactory: () => ConnectionSession<TLocalMethods, TRemoteMethods>,
    log?: (...args: unknown[]) => void
  ): Atom<ConnectionSession<TLocalMethods, TRemoteMethods> | null> {
    // Check if session already exists
    const existingSession = this.registry.get(targetWindow)

    if (!existingSession) {
      log?.(`📝 Creating new connection to target window`)
      const newSession = sessionFactory()
      this.setSession(targetWindow, newSession)
    } else {
      log?.(`♻️ Reusing existing connection to target window`)
    }

    return this.get(targetWindow) as Atom<ConnectionSession<TLocalMethods, TRemoteMethods> | null>
  }

  /**
   * Internal method to set session in registry
   */
  private setSession(targetWindow: Window, session: ConnectionSession<any, any>): void {
    this.registry.set(targetWindow, session)
    this.cleanupRegistry.register(targetWindow, session)
    this.notifyChange() // Notify that session was added
  }

  /**
   * Remove session from registry
   */
  delete(targetWindow: Window): boolean {
    const result = this.registry.delete(targetWindow)
    if (result) {
      this.notifyChange() // Notify that session was removed
    }
    return result
  }

  private notifyChange(): void {
    // Bump global version to trigger all atom re-evaluations
    this.store.set(this.globalVersionAtom, (prev: number) => prev + 1)
  }
}

// Global singleton instance
export const connectionRegistry = new ConnectionRegistry()
