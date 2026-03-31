import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import Script from 'next/script'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Nền tảng Flash Sale',
  description: 'Hệ thống quản lý Flash Sale',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="fixed inset-0 -z-20"
          style={{ background: 'linear-gradient(135deg, #08071a 0%, #0f0a2a 30%, #0a1030 60%, #0d0b22 100%)' }} />
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <Providers>
          {children}
        </Providers>
        <Toaster position="top-right" theme="dark" richColors />
      </body>
    </html>
  )
}
