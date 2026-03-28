'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ClipboardList, Package,
  Truck, Receipt, MoreHorizontal
} from 'lucide-react'
import { useState } from 'react'

const primaryNav = [
  { href: '/dashboard',       icon: LayoutDashboard, label: 'Home'     },
  { href: '/planned-orders',  icon: ClipboardList,   label: 'Orders'   },
  { href: '/truck-inventory', icon: Truck,            label: 'Inventory'},
  { href: '/packaging',       icon: Package,          label: 'Packing'  },
  { href: '/receipts',        icon: Receipt,          label: 'Receipts' },
]

export default function MobileNav() {
  const path = usePathname()
  const [showMore, setShowMore] = useState(false)

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowMore(false)}>
          <div className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl p-4 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-3">
              {[
                { href:'/order-list',        label:'Order List',       emoji:'🛒' },
                { href:'/recipe-matrix',     label:'Recipes',          emoji:'📖' },
                { href:'/config',            label:'Config',           emoji:'⚙️' },
                { href:'/users',             label:'Users',            emoji:'👥' },
                { href:'/income-statement',  label:'P&L',              emoji:'📊' },
              ].map(item => (
                <Link key={item.href} href={item.href}
                  onClick={() => setShowMore(false)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl ${
                    path === item.href ? 'bg-brand-50' : 'bg-gray-50'
                  }`}>
                  <span className="text-2xl">{item.emoji}</span>
                  <span className="text-xs text-gray-600 font-medium">{item.label}</span>
                </Link>
              ))}
            </div>
            {/* Logout */}
            <button
              onClick={async () => { await fetch('/api/auth', { method:'DELETE' }); window.location.href='/login' }}
              className="w-full mt-3 py-3 text-sm text-red-500 font-medium border border-red-100 rounded-xl">
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-2 pb-safe">
        <div className="flex items-center justify-around">
          {primaryNav.map(({ href, icon: Icon, label }) => {
            const active = path === href || path.startsWith(href + '/')
            return (
              <Link key={href} href={href}
                className={`flex flex-col items-center gap-0.5 py-2 px-3 min-w-0 flex-1 ${
                  active ? 'text-brand-600' : 'text-gray-400'
                }`}>
                <Icon className={`w-6 h-6 ${active ? 'text-brand-600' : 'text-gray-400'}`} />
                <span className={`text-xs font-medium truncate ${active ? 'text-brand-600' : 'text-gray-400'}`}>
                  {label}
                </span>
              </Link>
            )
          })}
          <button onClick={() => setShowMore(!showMore)}
            className={`flex flex-col items-center gap-0.5 py-2 px-3 flex-1 ${showMore ? 'text-brand-600' : 'text-gray-400'}`}>
            <MoreHorizontal className="w-6 h-6" />
            <span className="text-xs font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  )
}