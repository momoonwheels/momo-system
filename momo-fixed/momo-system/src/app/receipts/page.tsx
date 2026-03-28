'use client'
import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import { Receipt, Upload, CheckCircle, XCircle, AlertCircle, DollarSign } from 'lucide-react'

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [tab, setTab] = useState<'list'|'upload'|'cogs'>('list')

  const loadReceipts = useCallback(async () => {
    const res = await fetch('/api/receipts')
    setReceipts(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { loadReceipts() }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1]
      const res = await fetch('/api/receipts', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ image_base64: base64 })
      })
      const data = await res.json()
      if (data.ocr_failed) toast.error('OCR failed — receipt saved for manual entry')
      else toast.success('Receipt processed! Review line items below.')
      setUploading(false)
      loadReceipts()
      setSelected(data)
      setTab('list')
    }
    reader.readAsDataURL(file)
  }

  const confirmLine = async (lineId: string, confirmed: boolean, ingId?: string) => {
    const sb = (await import('@/lib/supabase')).supabase
    const updates: any = { status: confirmed ? 'confirmed' : 'rejected' }
    if (ingId) updates.matched_ingredient_id = ingId

    await sb.from('receipt_line_items').update(updates).eq('id', lineId)

    // If confirmed, update ingredient cost
    if (confirmed && selected) {
      const line = selected.line_items?.find((l:any) => l.id === lineId)
      if (line?.matched_ingredient_id && line.unit_price) {
        await sb.from('ingredients').update({ current_unit_cost: line.unit_price })
          .eq('id', line.matched_ingredient_id)
        await sb.from('cogs_log').insert({
          ingredient_id: line.matched_ingredient_id,
          receipt_id: selected.id,
          unit_price: line.unit_price,
          cost_per_recipe_unit: line.unit_price,
          notes: `From receipt: ${selected.vendor_name}`
        })
      }
    }
    toast.success(confirmed ? 'Line confirmed & inventory updated' : 'Line rejected')
    loadReceipts()
  }

  const confirmAll = async (receiptId: string) => {
    const sb = (await import('@/lib/supabase')).supabase
    const { data: lines } = await sb.from('receipt_line_items')
      .select('*').eq('receipt_id', receiptId).gte('match_confidence', 0.8)
    for (const line of lines||[]) await confirmLine(line.id, true)
    await sb.from('receipts').update({ status: 'confirmed' }).eq('id', receiptId)
    toast.success('All high-confidence lines confirmed!')
    loadReceipts()
  }

  const statusBadge = (s: string) => {
    const map: Record<string,any> = {
      confirmed: { label:'Confirmed', color:'green' },
      reviewing: { label:'Reviewing', color:'yellow' },
      rejected:  { label:'Rejected', color:'red' },
      pending:   { label:'Pending', color:'gray' },
    }
    const b = map[s] || map.pending
    return <Badge label={b.label} color={b.color} />
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Receipts & COGS"
        sub="Upload receipts to auto-update inventory costs and track COGS"
        action={
          <div className="flex gap-3">
            {['list','upload','cogs'].map(t => (
              <button key={t} onClick={() => setTab(t as any)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab===t ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}>{t==='list'?'Receipts':t==='upload'?'Upload Receipt':'COGS History'}</button>
            ))}
          </div>
        }
      />

      {tab === 'upload' && (
        <Card>
          <h2 className="font-semibold text-gray-900 mb-2">Upload Receipt</h2>
          <p className="text-sm text-gray-500 mb-6">Take a photo or screenshot of your receipt. Claude will parse it and match items to your inventory.</p>
          <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-brand-300 rounded-xl cursor-pointer bg-brand-50 hover:bg-brand-100 transition-colors">
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-brand-600">Parsing receipt with AI...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-10 h-10 text-brand-400" />
                <p className="text-sm text-brand-600 font-medium">Click to upload receipt image</p>
                <p className="text-xs text-gray-400">JPG, PNG, or screenshot</p>
              </div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-xs font-medium text-gray-600 mb-1">How it works:</p>
            <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
              <li>Upload a photo or screenshot of your receipt</li>
              <li>AI parses all line items and matches to your inventory</li>
              <li>High confidence (≥80%) matches are highlighted — review and confirm</li>
              <li>Low confidence matches need manual review</li>
              <li>Confirmed items update ingredient costs and COGS automatically</li>
            </ol>
          </div>
        </Card>
      )}

      {tab === 'list' && (
        loading ? <LoadingSpinner /> : (
          <div className="space-y-4">
            {receipts.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No receipts yet. Upload your first receipt!</p>
                </div>
              </Card>
            ) : receipts.map(r => (
              <Card key={r.id}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{r.vendor_name||'Unknown Vendor'}</h3>
                    <p className="text-sm text-gray-500">{r.receipt_date} · {r.receipt_line_items?.length||0} items</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.total_amount && (
                      <span className="flex items-center gap-1 text-sm font-semibold text-gray-800">
                        <DollarSign className="w-4 h-4" />{Number(r.total_amount).toFixed(2)}
                      </span>
                    )}
                    {statusBadge(r.status)}
                  </div>
                </div>
                {r.receipt_line_items?.length > 0 && (
                  <>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 border-b">
                          <th className="text-left pb-2">Item</th>
                          <th className="text-center pb-2">Matched To</th>
                          <th className="text-center pb-2">Confidence</th>
                          <th className="text-center pb-2">Qty</th>
                          <th className="text-center pb-2">Unit Price</th>
                          <th className="text-center pb-2">Status</th>
                          <th className="text-center pb-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.receipt_line_items.map((line: any) => {
                          const conf = Number(line.match_confidence)||0
                          return (
                            <tr key={line.id} className="border-b border-gray-50">
                              <td className="py-2 text-gray-700">{line.raw_text}</td>
                              <td className="py-2 text-center text-xs text-brand-600">{line.matched_ingredient_id ? '✓ Matched' : '—'}</td>
                              <td className="py-2 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  conf>=0.8?'bg-green-100 text-green-700':
                                  conf>=0.5?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'
                                }`}>{(conf*100).toFixed(0)}%</span>
                              </td>
                              <td className="py-2 text-center text-gray-600">{line.quantity} {line.unit}</td>
                              <td className="py-2 text-center text-gray-600">${Number(line.unit_price||0).toFixed(2)}</td>
                              <td className="py-2 text-center">{statusBadge(line.status)}</td>
                              <td className="py-2 text-center">
                                {line.status === 'pending' && (
                                  <div className="flex justify-center gap-1">
                                    <button onClick={() => confirmLine(line.id, true)}
                                      className="p-1 text-green-600 hover:bg-green-50 rounded">
                                      <CheckCircle className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => confirmLine(line.id, false)}
                                      className="p-1 text-red-500 hover:bg-red-50 rounded">
                                      <XCircle className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {r.status === 'reviewing' && (
                      <div className="mt-3 flex justify-end">
                        <button onClick={() => confirmAll(r.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
                          <CheckCircle className="w-4 h-4" />
                          Confirm All High-Confidence Items
                        </button>
                      </div>
                    )}
                  </>
                )}
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'cogs' && <COGSView />}
    </div>
  )
}

function COGSView() {
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<any[]>([])
  const [weekStart, setWeekStart] = useState('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const { format: fmt, startOfWeek: sow } = require('date-fns')
    setWeekStart(fmt(sow(new Date(),{weekStartsOn:1}),'yyyy-MM-dd'))
    import('@/lib/supabase').then(({supabase}) => {
      supabase.from('locations').select('*').eq('active',true).then(({data: locs}) => {
        setLocations(locs||[])
        if (locs?.[0]) setLocationId(locs[0].id)
      })
    })
  }, [])

  useEffect(() => {
    if (!locationId || !weekStart) return
    setLoading(true)
    fetch(`/api/cogs?location_id=${locationId}&week_start=${weekStart}`)
      .then(r=>r.json()).then(d => { setData(d); setLoading(false) })
  }, [locationId, weekStart])

  const totalCOGS = data?.cogs?.reduce((sum: number, c: any) => sum + (c.totalCost||0), 0) || 0

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <select
          value={locationId}
          onChange={e => setLocationId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {totalCOGS > 0 && (
          <div className="text-sm font-semibold text-brand-700 bg-brand-50 px-4 py-2 rounded-lg">
            Total COGS: ${totalCOGS.toFixed(2)}
          </div>
        )}
      </div>
      {loading ? <LoadingSpinner /> : data?.cogs ? (
        data.cogs.filter((c:any)=>c.totalCost>0).length === 0 ? (
          <Card>
            <div className="text-center py-12 text-gray-500">
              <p className="font-medium">No COGS data yet</p>
              <p className="text-sm mt-1">Add ingredient costs via receipts first, then COGS will calculate automatically</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {data.cogs.filter((c:any)=>c.totalCost>0).map((ctx: any) => (
              <Card key={ctx.context}>
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold text-gray-900">{ctx.label}</h3>
                  <span className="text-sm font-bold text-brand-700">\${ctx.totalCost.toFixed(2)}</span>
                </div>
                {ctx.costPerOrder !== undefined && (
                  <p className="text-xs text-gray-500 mb-3">
                    Cost per order: <span className="font-semibold text-gray-700">\${(ctx.costPerOrder||0).toFixed(2)}</span>
                  </p>
                )}
                {ctx.costPerBatch !== undefined && (
                  <p className="text-xs text-gray-500 mb-3">
                    Cost per batch: <span className="font-semibold text-gray-700">\${(ctx.costPerBatch||0).toFixed(2)}</span>
                  </p>
                )}
                <div className="space-y-1 mt-2 border-t border-gray-50 pt-2">
                  {ctx.ingredients.filter((i:any)=>i.totalCost>0).slice(0,6).map((ing: any) => (
                    <div key={ing.code} className="flex justify-between text-xs">
                      <span className="text-gray-600">{ing.name}</span>
                      <span className="text-gray-700 font-medium">\${ing.totalCost.toFixed(2)}</span>
                    </div>
                  ))}
                  {ctx.ingredients.filter((i:any)=>i.totalCost>0).length > 6 && (
                    <p className="text-xs text-gray-400 text-right">+{ctx.ingredients.filter((i:any)=>i.totalCost>0).length - 6} more</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card>
          <div className="text-center py-12 text-gray-400">Select a location to view COGS</div>
        </Card>
      )}
    </div>
  )
}
