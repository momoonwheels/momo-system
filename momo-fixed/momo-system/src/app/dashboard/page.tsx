'use client'
import { useEffect, useState } from 'react'
import { format, startOfWeek } from 'date-fns'
import { Package, ShoppingCart, Truck, TrendingUp, ClipboardList, Receipt } from 'lucide-react'
import StatCard from '@/components/ui/StatCard'
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

  return (
    <div className="p-8">
      <PageHeader
        title="Dashboard"
        sub={`Week of ${format(new Date(weekStart), 'MMMM d, yyyy')}`}
      />

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Locations" value={locations.length} icon={Truck} color="brand" />
        <StatCard label="Food Trucks" value={trucks.length} icon={Truck} color="blue" />
        <StatCard label="Pending Receipts" value={pending} sub="awaiting review" icon={Receipt} color="yellow" />
        <StatCard label="Current Week" value={format(new Date(), 'MMM d')} sub="today" icon={TrendingUp} color="green" />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {[
          { href:'/planned-orders', icon: ClipboardList, title:'Planned Orders', desc:'Set expected weekly orders per location', color:'brand' },
          { href:'/truck-inventory', icon: Truck, title:'Truck Inventory', desc:'Update package counts on food trucks', color:'blue' },
          { href:'/packaging', icon: Package, title:'Packaging List', desc:'What Newport needs to prepare and send', color:'green' },
          { href:'/order-list', icon: ShoppingCart, title:'Order List', desc:'Raw ingredients Newport needs to buy', color:'purple' },
          { href:'/receipts', icon: Receipt, title:'Receipts & COGS', desc:'Upload receipts, track costs and COGS', color:'yellow' },
          { href:'/config', icon: Package, title:'Configuration', desc:'Manage batch sizes, serving sizes, packages', color:'gray' },
        ].map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-brand-50 rounded-lg">
                  <Icon className="w-5 h-5 text-brand-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{desc}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {receipts.length > 0 && (
        <Card>
          <h2 className="font-semibold text-gray-900 mb-4">Recent Receipts</h2>
          <div className="space-y-3">
            {receipts.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-800">{r.vendor_name||'Unknown Vendor'}</span>
                  <span className="text-xs text-gray-400 ml-2">{r.receipt_date}</span>
                </div>
                <div className="flex items-center gap-3">
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