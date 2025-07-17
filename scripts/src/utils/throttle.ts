/**
 * Type representing a function with a cancel method
 */
export type ThrottledFunction<F extends (...args: any[]) => any> = F & { cancel: () => void }

/**
 * Throttles a function to execute at most once per specified delay period.
 * Uses leading edge execution - calls immediately on first invocation, then throttles subsequent calls.
 *
 * @param func - The function to throttle
 * @param delay - Minimum delay between function executions in milliseconds
 * @returns Throttled function with a cancel method
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ThrottledFunction<T> {
  let timeoutId: NodeJS.Timeout | null = null
  let lastExecTime = 0
  const NO_ARGS = Symbol('NO_ARGS')
  let lastArgs: Parameters<T> | typeof NO_ARGS = NO_ARGS

  const executeWithLatestArgs = () => {
    if (lastArgs !== NO_ARGS) {
      lastExecTime = Date.now()
      timeoutId = null
      func(...lastArgs)
    }
  }

  const throttledFunction = ((...args: Parameters<T>) => {
    const now = Date.now()
    // If enough time has passed since last execution, execute immediately
    if (now - lastExecTime >= delay) {
      lastExecTime = now
      return func(...args)
    }
    lastArgs = args // Always store the most recent args
    // If there's already a timeout scheduled, don't create another one
    // The existing timeout will use the most recent args when it fires
    if (timeoutId !== null) {
      return
    }
    // Schedule execution for the remaining delay time
    const remainingDelay = delay - (now - lastExecTime)
    timeoutId = setTimeout(executeWithLatestArgs, remainingDelay)
  }) as ThrottledFunction<T>

  // Add cancel method to clear pending executions
  throttledFunction.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  return throttledFunction
}
