import type { Bridge } from './types'

// Simple global bridge registry for React Strict Mode
class BridgeRegistry {
  private bridges = new Map<Window, Bridge<any, any>>()

  // Register a new bridge, cleaning up any existing one for the same window
  register<TLocal extends Record<string, any>, TRemote extends Record<string, any>>(
    bridge: Bridge<TLocal, TRemote>,
    targetWindow: Window
  ): void {
    // Clean up any existing bridge for this window
    const existingBridge = this.bridges.get(targetWindow)
    if (existingBridge && existingBridge !== bridge) {
      console.log(`🧹 BridgeRegistry: Cleaning up duplicate bridge for window`)
      existingBridge.destroy()
    }

    // Register the new bridge
    this.bridges.set(targetWindow, bridge as Bridge<any, any>)
  }

  // Unregister a bridge
  unregister<TLocal extends Record<string, any>, TRemote extends Record<string, any>>(
    bridge: Bridge<TLocal, TRemote>,
    targetWindow?: Window
  ): void {
    if (targetWindow) {
      const registeredBridge = this.bridges.get(targetWindow)
      if (registeredBridge === bridge) {
        this.bridges.delete(targetWindow)
      }
    } else {
      // Remove by bridge instance (fallback)
      for (const [window, registeredBridge] of this.bridges.entries()) {
        if (registeredBridge === bridge) {
          this.bridges.delete(window)
          break
        }
      }
    }
  }

  // Get active bridge count (for debugging)
  getActiveCount(): number {
    return this.bridges.size
  }

  // Clear all bridges (for testing)
  clear(): void {
    for (const bridge of this.bridges.values()) {
      bridge.destroy()
    }
    this.bridges.clear()
  }
}

// Global singleton instance
export const bridgeRegistry = new BridgeRegistry()
