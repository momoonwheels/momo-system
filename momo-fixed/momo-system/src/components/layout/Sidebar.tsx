'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ClipboardList, Package, ShoppingCart,
  Truck, Receipt, Settings, BookOpen, UtensilsCrossed, Users
} from 'lucide-react'

const nav = [
  { href: '/dashboard',       icon: LayoutDashboard, label: 'Dashboard'       },
  { href: '/planned-orders',  icon: ClipboardList,   label: 'Planned Orders'  },
  { href: '/truck-inventory', icon: Truck,            label: 'Truck Inventory' },
  { href: '/packaging',       icon: Package,          label: 'Packaging'       },
  { href: '/order-list',      icon: ShoppingCart,     label: 'Order List'      },
  { href: '/receipts',        icon: Receipt,          label: 'Receipts & COGS' },
  { href: '/recipe-matrix',   icon: BookOpen,         label: 'Recipe Matrix'   },
  { href: '/config',          icon: Settings,         label: 'Configuration'   },
  { href: '/users',           icon: Users,            label: 'Users'           },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <div className="w-64 bg-brand-900 text-white flex flex-col h-screen">
      <div className="p-6 border-b border-brand-800">
        <div className="flex items-center gap-3">
          <UtensilsCrossed className="w-8 h-8 text-brand-300" />
          <div>
            <div className="font-bold text-lg leading-tight">Momo on the</div>
            <div className="font-bold text-lg text-brand-300 leading-tight">Wheels</div>
          </div>
        </div>
        <div className="text-xs text-brand-400 mt-1">Newport Operations</div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = path === href || path.startsWith(href + '/')
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                active
                  ? 'bg-brand-600 text-white font-medium'
                  : 'text-brand-300 hover:bg-brand-800 hover:text-white'
              }`}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="p-4 border-t border-brand-800 text-xs text-brand-500">
        v1.0 · Newport
      </div>
    </div>
  )
}
