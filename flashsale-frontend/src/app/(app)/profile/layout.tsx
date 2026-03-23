import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Hồ sơ | Flash Sale Platform',
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
