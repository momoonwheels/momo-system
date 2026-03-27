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
  const [inventory, setInventory] = useState<Record<string,number>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    const [pkgRes, invRes] = await Promise.all([
      import('@/lib/supabase').then(({supabase}) =>
        supabase.from('packages').select('*, containers(code,name)').order('sort_order').not('is_fixed','eq',true)
      ),
      fetch(`/api/truck-inventory?location_id=${locationId}`).then(r=>r.json())
    ])
    setPackages(pkgRes.data||[])
    const inv: Record<string,number> = {}
    for (const row of invRes||[]) {
      const code = row.packages?.code
      if (code) inv[code] = Number(row.quantity)||0
    }
    setInventory(inv)
    setLoading(false)
  }, [locationId])

  useEffect(() => { load() }, [locationId])

  const handleChange = (code: string, val: string) => {
    setInventory(prev => ({ ...prev, [code]: Number(val)||0 }))
  }

  const save = async () => {
    if (!locationId) return toast.error('Select a location first')
    setSaving(true)
    const body = packages.map(p => ({
      location_id: locationId,
      package_id: p.id,
      quantity: inventory[p.code]||0,
      updated_by: 'truck_staff'
    }))
    const res = await fetch('/api/truck-inventory', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    })
    if (res.ok) toast.success('Inventory updated!')
    else toast.error('Failed to save')
    setSaving(false)
  }

  // Group by container
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
        sub="Enter how many of each package are currently on the truck (green = enter count)"
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
          {(Object.entries(grouped) as [string, any[]][]).map(([container, pkgs]) => (
            <Card key={container} className="p-0 overflow-hidden">
              <div className="px-4 py-3 bg-brand-900 text-white font-semibold text-sm">
                {container} Container
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Package ID</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Contents</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Size</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">On Truck</th>
                  </tr>
                </thead>
                <tbody>
                  {pkgs.map((pkg, i) => (
                    <tr key={pkg.code} className={i%2===0?'bg-white':'bg-gray-50'}>
                      <td className="px-4 py-2.5 text-sm font-mono font-bold text-brand-700">{pkg.code}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{pkg.contents}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 text-center">{pkg.size_qty} {pkg.size_unit}</td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="number" min="0"
                          value={inventory[pkg.code]||0}
                          onChange={e => handleChange(pkg.code, e.target.value)}
                          className="w-20 text-center text-sm border border-green-200 bg-green-50 text-green-800 font-semibold rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}