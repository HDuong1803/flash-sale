// Merchant pages require authentication — disable static generation.
export const dynamic = 'force-dynamic'

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
