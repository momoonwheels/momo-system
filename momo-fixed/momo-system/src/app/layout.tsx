import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import Sidebar from '@/components/layout/Sidebar'
import MobileNav from '@/components/layout/MobileNav'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Momo on the Wheels',
  description: 'Operations Management System',
  manifest: '/manifest.json',
  themeColor: '#5C3317',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Momo OPS',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Momo OPS" />
      </head>
      <body className={inter.className}>
        <div className="flex h-screen bg-gray-50">
          {/* Desktop sidebar - hidden on mobile */}
          <div className="hidden lg:flex">
            <Sidebar />
          </div>
          {/* Main content */}
          <main className="flex-1 overflow-auto pb-20 lg:pb-0">
            {children}
          </main>
        </div>
        {/* Mobile bottom nav - hidden on desktop */}
        <div className="lg:hidden">
          <MobileNav />
        </div>
        <Toaster position="top-center" />
      </body>
    </html>
  )
}