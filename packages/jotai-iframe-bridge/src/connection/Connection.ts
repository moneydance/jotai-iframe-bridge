import type { Methods, RemoteProxy } from './types'

// ==================== Connection ====================

export class Connection<T extends Record<keyof T, (...args: any[]) => any> = Methods> {
  public promise: Promise<RemoteProxy<T>>
  private destroyFn: () => void
  private _destroyed = false

  constructor(promise: Promise<RemoteProxy<T>>, destroyFn: () => void) {
    this.promise = promise
    this.destroyFn = destroyFn
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this.destroyFn()
  }
}
