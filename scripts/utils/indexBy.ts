/**
 * Generic utility to index a collection by a specified property
 * @param collection Array of items to index
 * @param keyFn Function that extracts the key from each item
 * @returns Map indexed by the key
 */
export function indexBy<T, K>(collection: T[], keyFn: (item: T) => K): Map<K, T> {
  const indexed = new Map<K, T>()

  for (const item of collection) {
    const key = keyFn(item)
    indexed.set(key, item)
  }

  return indexed
}

/**
 * Convenience function to index by a property name
 * @param collection Array of items to index
 * @param keyProp Property name to index by
 * @returns Map indexed by the property value
 */
export function indexByProperty<T, K extends keyof T>(collection: T[], keyProp: K): Map<T[K], T> {
  return indexBy(collection, (item) => item[keyProp])
}
