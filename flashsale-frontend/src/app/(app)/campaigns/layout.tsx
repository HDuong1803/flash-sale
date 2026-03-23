import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Chiến dịch | Flash Sale Platform',
}

export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
