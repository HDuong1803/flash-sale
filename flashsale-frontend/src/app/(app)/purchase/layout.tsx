// Purchase pages require authentication — disable static generation.
export const dynamic = 'force-dynamic'

export default function PurchaseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
