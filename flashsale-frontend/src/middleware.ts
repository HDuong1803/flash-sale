import { NextRequest, NextResponse } from 'next/server'

const PUBLIC = ['/', '/campaigns', '/register', '/payment/return']

const ROLE_ROUTES: Record<string, string[]> = {
  '/merchant': ['MERCHANT'],
  '/admin':    ['ADMIN'],
}

const AUTH_ROUTES = ['/checkout', '/orders', '/purchase', '/profile']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // access_token is HttpOnly but Next.js middleware runs server-side — it CAN read it.
  // Cookies set by the backend at localhost:3000 are domain-scoped to 'localhost',
  // so they arrive on all requests to localhost regardless of port.
  const token = request.cookies.get('access_token')?.value
  const userRole = request.cookies.get('user-role')?.value

  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (isPublic) return NextResponse.next()

  const needsAuth = AUTH_ROUTES.some((r) => pathname.startsWith(r))
  const roleEntry = Object.entries(ROLE_ROUTES).find(([r]) => pathname.startsWith(r))

  if ((needsAuth || roleEntry) && !token) {
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
