// ==================== Deferred Promise Utility ====================

export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
  status: 'pending' | 'resolved' | 'rejected'
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  let status: Deferred<T>['status'] = 'pending'

  const promise = new Promise<T>((res, rej) => {
    resolve = (value: T) => {
      status = 'resolved'
      res(value)
    }
    reject = (reason: unknown) => {
      status = 'rejected'
      rej(reason)
    }
  })

  return { promise, resolve, reject, status }
}
