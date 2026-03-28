'use client'
import { useEffect, useState } from 'react'
import { format, startOfWeek } from 'date-fns'
import { Package, ShoppingCart, Truck, TrendingUp, ClipboardList, Receipt } from 'lucide-react'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function Dashboard() {
  const [locations, setLocations] = useState<any[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

  useEffect(() => {
    Promise.all([
      supabase.from('locations').select('*').eq('active', true),
      supabase.from('receipts').select('*').order('created_at', { ascending: false }).limit(5),
    ]).then(([loc, rec]) => {
      setLocations(loc.data||[])
      setReceipts(rec.data||[])
      setLoading(false)
    })
  }, [])

  if (loading) return <LoadingSpinner />

  const trucks = locations.filter(l => l.type === 'food_truck')
  const pending = receipts.filter(r => r.status === 'reviewing').length

  const quickLinks = [
    { href:'/planned-orders',  emoji:'📋', title:'Planned Orders',  desc:'Set weekly orders' },
    { href:'/truck-inventory', emoji:'🚚', title:'Truck Inventory', desc:'Count packages' },
    { href:'/packaging',       emoji:'📦', title:'Packaging',       desc:'What to send' },
    { href:'/order-list',      emoji:'🛒', title:'Order List',      desc:'Buy ingredients' },
    { href:'/receipts',        emoji:'🧾', title:'Receipts',        desc:'Upload & COGS' },
    { href:'/income-statement',emoji:'📊', title:'P&L',             desc:'Income statement' },
  ]

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Dashboard"
        sub={`Week of ${format(new Date(weekStart), 'MMM d, yyyy')}`}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label:'Locations', value: locations.length, icon:'📍' },
          { label:'Food Trucks', value: trucks.length, icon:'🚚' },
          { label:'Pending Receipts', value: pending, icon:'🧾' },
          { label:'Today', value: format(new Date(),'MMM d'), icon:'📅' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-xl lg:text-2xl font-bold text-gray-900">{stat.value}</div>
            <div className="text-xs text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {quickLinks.map(({ href, emoji, title, desc }) => (
          <Link key={href} href={href}>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer active:scale-95 transition-transform">
              <div className="text-2xl mb-2">{emoji}</div>
              <div className="font-semibold text-gray-900 text-sm">{title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent receipts */}
      {receipts.length > 0 && (
        <Card>
          <h2 className="font-semibold text-gray-900 mb-3 text-sm lg:text-base">Recent Receipts</h2>
          <div className="space-y-2">
            {receipts.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-800">{r.vendor_name||'Unknown Vendor'}</span>
                  <span className="text-xs text-gray-400 ml-2 hidden sm:inline">{r.receipt_date}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.total_amount && <span className="text-sm font-medium">${Number(r.total_amount).toFixed(2)}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    r.status==='confirmed'?'bg-green-100 text-green-700':
                    r.status==='reviewing'?'bg-yellow-100 text-yellow-700':
                    'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}