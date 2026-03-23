// Customer pages require authentication — disable static generation.
export const dynamic = 'force-dynamic'

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
