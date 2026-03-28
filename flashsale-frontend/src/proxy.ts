import { NextRequest, NextResponse } from 'next/server'

const PUBLIC = ['/', '/campaigns', '/register', '/payment/return']

const ROLE_ROUTES: Record<string, string[]> = {
  '/merchant/dashboard':  ['MERCHANT', 'ADMIN'],
  '/merchant/campaigns':  ['MERCHANT', 'ADMIN'],
  '/merchant/products':   ['MERCHANT', 'ADMIN'],
  '/merchant/orders':     ['MERCHANT', 'ADMIN'],
  '/merchant/revenue':    ['MERCHANT', 'ADMIN'],
  '/customer/dashboard':  ['CUSTOMER', 'MERCHANT'],
  '/admin':               ['ADMIN'],
}

const AUTH_ROUTES = [
  '/checkout',
  '/orders',
  '/purchase',
  '/profile',
  '/settings',
  '/notifications',
  '/merchant/apply',
]

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const token = request.cookies.get('access_token')?.value

  const userRole = request.cookies.get('user-role')?.value

  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (isPublic) return NextResponse.next()

  const needsAuth = AUTH_ROUTES.some((r) => pathname.startsWith(r))
  const roleEntry = Object.entries(ROLE_ROUTES).find(([r]) => pathname.startsWith(r))

  const hasSession = !!token || !!userRole

  if ((needsAuth || roleEntry) && !hasSession) {
    const response = NextResponse.redirect(new URL('/', request.url))
    response.cookies.set('auth-redirect', pathname, { maxAge: 300 })
    return response
  }

  if (roleEntry && userRole && !roleEntry[1].includes(userRole)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
