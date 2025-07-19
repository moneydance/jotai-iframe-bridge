// ==================== Safe Assignment Utility ====================

type SyncAssignment<T> = () => T
type AsyncAssignment<T> = () => Promise<T>

type IsAsync<T> = T extends () => Promise<any> ? true : false

export type SafeResult<T> =
  | [ok: false, error: unknown, value: null]
  | [ok: true, error: null, value: T]

export function safeAssignment<T extends SyncAssignment<any> | AsyncAssignment<any>>(
  assignment: T
): IsAsync<T> extends true ? Promise<SafeResult<Awaited<ReturnType<T>>>> : SafeResult<ReturnType<T>>
export function safeAssignment<T>(assignment: SyncAssignment<T> | AsyncAssignment<T>) {
  let result: T | Promise<T>
  try {
    result = assignment()
  } catch (error) {
    return [false, error, null] as SafeResult<T>
  }
  if (result instanceof Promise) {
    return result
      .then((value) => [true, null, value] as SafeResult<T>)
      .catch((error) => [false, error, null] as SafeResult<T>)
  }
  return [true, null, result] as SafeResult<T>
}
