'use client'
import { usePathname } from 'next/navigation'
import { Menu, UtensilsCrossed } from 'lucide-react'

const PAGE_TITLES: Record<string,string> = {
  '/dashboard': 'Dashboard',
  '/planned-orders': 'Planned Orders',
  '/truck-inventory': 'Truck Inventory',
  '/packaging': 'Packaging',
  '/order-list': 'Order List',
  '/receipts': 'Receipts & COGS',
  '/recipe-matrix': 'Recipe Matrix',
  '/config': 'Configuration',
  '/users': 'Users',
  '/income-statement': 'Income Statement',
}

interface MobileNavProps {
  onMenuClick: () => void
}

export default function MobileNav({ onMenuClick }: MobileNavProps) {
  const path = usePathname()
  const title = PAGE_TITLES[path] || 'Momo on the Wheels'

  return (
    <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-brand-900 text-white">
      <button onClick={onMenuClick} className="p-2 rounded-lg hover:bg-brand-800">
        <Menu className="w-5 h-5" />
      </button>
      <span className="font-semibold text-sm">{title}</span>
      <div className="p-2">
        <UtensilsCrossed className="w-5 h-5 text-brand-300" />
      </div>
    </div>
  )
}
