import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Đơn hàng | Flash Sale Platform',
}

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
