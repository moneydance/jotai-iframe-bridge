// ==================== ID Generation Utility ====================

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11)
}
