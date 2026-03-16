export function createIdempotencyKey(): string {
  return crypto.randomUUID()
}

export function getOrCreateKey(action: string): string {
  if (typeof window === 'undefined') return createIdempotencyKey()
  const existing = sessionStorage.getItem(`idem:${action}`)
  if (existing) return existing
  const key = createIdempotencyKey()
  sessionStorage.setItem(`idem:${action}`, key)
  return key
}

export function clearKey(action: string): void {
  if (typeof window !== 'undefined') sessionStorage.removeItem(`idem:${action}`)
}
