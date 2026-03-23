import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Thông báo | Flash Sale Platform',
}

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
