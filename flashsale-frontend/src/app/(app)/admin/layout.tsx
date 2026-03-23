// All admin pages are protected and require authentication.
// Disable static generation to prevent prerender errors from auth store / API calls.
export const dynamic = 'force-dynamic'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
