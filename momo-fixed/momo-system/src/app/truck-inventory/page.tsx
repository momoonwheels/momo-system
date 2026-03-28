'use client'
import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LocationSelector from '@/components/ui/LocationSelector'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function TruckInventoryPage() {
  const [locationId, setLocationId] = useState('')
  const [packages, setPackages] = useState<any[]>([])
  const [onHand, setOnHand] = useState<Record<string,number>>({})
  const [delivery, setDelivery] = useState<Record<string,number>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    const [pkgRes, invRes] = await Promise.all([
      import('@/lib/supabase').then(({supabase}) =>
        supabase.from('packages').select('*, containers(code,name)').order('sort_order')
      ),
      fetch(`/api/truck-inventory?location_id=${locationId}`).then(r=>r.json())
    ])
    setPackages(pkgRes.data||[])
    const oh: Record<string,number> = {}
    const del: Record<string,number> = {}
    for (const row of invRes||[]) {
      const code = row.packages?.code
      if (code) {
        oh[code] = Number(row.quantity)||0
        del[code] = Number(row.delivery_received)||0
      }
    }
    setOnHand(oh)
    setDelivery(del)
    setLoading(false)
  }, [locationId])

  useEffect(() => { load() }, [locationId])

  const save = async () => {
    if (!locationId) return toast.error('Select a location first')
    setSaving(true)
    const body = packages.map(p => ({
      location_id: locationId,
      package_id: p.id,
      quantity: onHand[p.code]||0,
      delivery_received: delivery[p.code]||0,
      updated_by: 'truck_staff'
    }))
    const res = await fetch('/api/truck-inventory', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    })
    if (res.ok) toast.success('Inventory updated!')
    else toast.error('Failed to save')
    setSaving(false)
  }

  const grouped = packages.reduce((acc: Record<string,any[]>, pkg) => {
    const cont = pkg.containers?.name || 'Other'
    if (!acc[cont]) acc[cont] = []
    acc[cont].push(pkg)
    return acc
  }, {})

  return (
    <div className="p-8">
      <PageHeader
        title="Truck Inventory"
        sub="Enter delivery received and current on hand for each package"
        action={
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Inventory'}
          </button>
        }
      />
      <div className="mb-6">
        <LocationSelector onChange={setLocationId} filter="food_truck" />
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([container, pkgs]) => (
            <Card key={container} className="p-0 overflow-hidden">
              <div className="px-4 py-3 bg-brand-900 text-white font-semibold text-sm">
                {container} Container
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Package</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Contents</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Size</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-green-600 uppercase">Delivery Received ← enter</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-blue-600 uppercase">On Hand ← enter</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-brand-700 uppercase">Total on Truck</th>
                  </tr>
                </thead>
                <tbody>
                  {(pkgs as any[]).map((pkg, i) => {
                    const total = (onHand[pkg.code]||0) + (delivery[pkg.code]||0)
                    return (
                      <tr key={pkg.code} className={i%2===0?'bg-white':'bg-gray-50'}>
                        <td className="px-4 py-2.5 text-sm font-mono font-bold text-brand-700">{pkg.code}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-700">{pkg.contents}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 text-center">{pkg.size_qty} {pkg.size_unit}</td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="number" min="0"
                            value={delivery[pkg.code]||0}
                            onChange={e => setDelivery(prev => ({...prev, [pkg.code]: Number(e.target.value)||0}))}
                            className="w-20 text-center text-sm border border-green-200 bg-green-50 text-green-800 font-semibold rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="number" min="0"
                            value={onHand[pkg.code]||0}
                            onChange={e => setOnHand(prev => ({...prev, [pkg.code]: Number(e.target.value)||0}))}
                            className="w-20 text-center text-sm border border-blue-200 bg-blue-50 text-blue-800 font-semibold rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                            total > 0 ? 'text-white bg-brand-600' : 'text-gray-400 bg-gray-100'
                          }`}>{total}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
