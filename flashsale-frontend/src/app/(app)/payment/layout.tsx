// Payment pages use useSearchParams and require authentication — disable static generation.
export const dynamic = 'force-dynamic'

export default function PaymentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
