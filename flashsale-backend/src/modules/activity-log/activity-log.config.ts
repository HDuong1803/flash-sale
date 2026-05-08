/**
 * ACTION_ROUTES — maps (HTTP method + path regex) → action label.
 *
 * Rules:
 * - Pattern is matched against req.path (e.g. "/api/v1/orders/purchase")
 * - extractTargetId: pull a meaningful ID from the path for audit trail
 * - Only 2xx responses are logged (interceptor uses tap, not catchError)
 * - Order matters: first match wins
 */

export interface ActionRoute {
  method: string
  pattern: RegExp
  action: string
  /** Extract a targetId from the request path (optional) */
  extractTargetId?: (path: string) => string | null
}

export const ACTION_ROUTES: ActionRoute[] = [
  // ─── Auth ──────────────────────────────────────────────────────────────────
  {
    method: 'POST',
    pattern: /\/auth\/login$/,
    action: 'login'
  },
  {
    method: 'POST',
    pattern: /\/auth\/google$/,
    action: 'login'
  },
  {
    method: 'POST',
    pattern: /\/auth\/verify-otp$/,
    action: 'register'
  },
  {
    method: 'POST',
    pattern: /\/auth\/logout$/,
    action: 'logout'
  },
  {
    method: 'POST',
    pattern: /\/auth\/register$/,
    action: 'register'
  },

  // ─── Commerce ──────────────────────────────────────────────────────────────
  {
    method: 'POST',
    pattern: /\/orders\/purchase$/,
    action: 'purchase'
  },
  {
    method: 'POST',
    pattern: /\/checkout$/,
    action: 'checkout'
  },
  {
    // POST /campaigns/:id/register
    method: 'POST',
    pattern: /\/campaigns\/([^/]+)\/register$/,
    action: 'reserve',
    extractTargetId: (path: string) => {
      const m = path.match(/\/campaigns\/([^/]+)\/register$/)
      return m?.[1] ?? null
    }
  }
]

export function matchRoute(
  method: string,
  path: string
): ActionRoute | undefined {
  return ACTION_ROUTES.find(
    r => r.method === method.toUpperCase() && r.pattern.test(path)
  )
}
