/**
 * Utility for handling option selection with keys (1-9, then a-z)
 * Supports up to 35 options total (9 numbers + 26 letters)
 */
export const OptionSelector = {
  /**
   * Generate selection keys for a given number of options
   * Returns keys in order: 1-9, then a-z
   */
  getSelectionKeys(count: number): string[] {
    const keys: string[] = []

    // Add numbers 1-9
    for (let i = 1; i <= Math.min(9, count); i++) {
      keys.push(i.toString())
    }

    // Add letters a-z for remaining items
    if (count > 9) {
      const lettersNeeded = count - 9
      for (let i = 0; i < lettersNeeded && i < 26; i++) {
        keys.push(String.fromCharCode('a'.charCodeAt(0) + i))
      }
    }

    return keys
  },

  /**
   * Convert a selection key to its corresponding array index
   * Returns -1 for invalid keys
   */
  getSelectionIndex(key: string): number {
    // Handle numbers 1-9 (index 0-8)
    const num = parseInt(key, 10)
    if (!Number.isNaN(num) && num >= 1 && num <= 9) {
      return num - 1
    }

    // Handle letters a-z (index 9-34)
    const lowerKey = key.toLowerCase()
    if (lowerKey.length === 1 && lowerKey >= 'a' && lowerKey <= 'z') {
      return 9 + (lowerKey.charCodeAt(0) - 'a'.charCodeAt(0))
    }

    return -1 // Invalid key
  },

  /**
   * Format selection keys into a readable range for display
   * Examples: "1-5", "1-9, a-f", "1", "a-c"
   */
  getSelectionKeyRange(keys: string[]): string {
    if (keys.length === 0) return ''
    if (keys.length === 1) return keys[0]

    const firstKey = keys[0]
    const lastKey = keys[keys.length - 1]

    // If we only have numbers, show as range
    if (keys.every((key) => /^\d$/.test(key))) {
      return `${firstKey}-${lastKey}`
    }

    // If we have numbers and letters, show both ranges
    const numbers = keys.filter((key) => /^\d$/.test(key))
    const letters = keys.filter((key) => /^[a-z]$/.test(key))

    if (numbers.length > 0 && letters.length > 0) {
      const numberRange =
        numbers.length === 1 ? numbers[0] : `${numbers[0]}-${numbers[numbers.length - 1]}`
      const letterRange =
        letters.length === 1 ? letters[0] : `${letters[0]}-${letters[letters.length - 1]}`
      return `${numberRange}, ${letterRange}`
    }

    // Fallback to showing first and last
    return `${firstKey}-${lastKey}`
  },
} as const
