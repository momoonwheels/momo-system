'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ClipboardList, Package, ShoppingCart,
  Truck, Receipt, Settings, BookOpen, UtensilsCrossed, Users,
  TrendingUp, Banknote, FileText, X, LogOut, Warehouse
} from 'lucide-react'
const nav = [
  { href: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard'        },
  { href: '/planned-orders',   icon: ClipboardList,   label: 'Planned Orders'   },
  { href: '/truck-inventory',  icon: Truck,           label: 'Truck Inventory'  },
  { href: '/packaging',        icon: Package,         label: 'Packaging'        },
  { href: '/order-list',       icon: ShoppingCart,    label: 'Order List'       },
  { href: '/fixed-inventory',  icon: Warehouse,       label: 'Fixed Inventory'  },
  { href: '/receipts',         icon: Receipt,         label: 'Receipts & COGS'  },
  { href: '/recipe-matrix',    icon: BookOpen,        label: 'Recipe Matrix'    },
  { href: '/config',           icon: Settings,        label: 'Configuration'    },
  { href: '/users',            icon: Users,           label: 'Users'            },
  { href: '/income-statement', icon: TrendingUp,      label: 'Income Statement' },
  { href: '/cash-flow',        icon: Banknote,        label: 'Cash Flow'        },
  { href: '/weekly-report',    icon: FileText,        label: 'Weekly Report'    },
]
export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const path = usePathname()
  return (
    <div className="w-64 bg-brand-900 text-white flex flex-col h-full">
      <div className="p-5 border-b border-brand-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UtensilsCrossed className="w-7 h-7 text-brand-300 flex-shrink-0" />
            <div>
              <div className="font-bold text-base leading-tight">Momo on the</div>
              <div className="font-bold text-base text-brand-300 leading-tight">Wheels</div>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1.5 hover:bg-brand-800 rounded-lg lg:hidden">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="text-xs text-brand-400 mt-1.5">Newport Operations</div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = path === href || path.startsWith(href + '/')
          return (
            <Link key={href} href={href} onClick={onClose}
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
      <div className="p-3 border-t border-brand-800">
        <button
          onClick={async () => {
            await fetch('/api/auth', { method: 'DELETE' })
            window.location.href = '/login'
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-brand-300 hover:text-white hover:bg-brand-800 rounded-lg text-sm transition-all">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Sign Out
        </button>
        <div className="text-xs text-brand-600 mt-2 px-3">v1.0</div>
      </div>
    </div>
  )
}
