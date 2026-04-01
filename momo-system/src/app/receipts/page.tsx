'use client'
import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import { Receipt, Upload, CheckCircle, XCircle, DollarSign, Trash2, AlertCircle, GitMerge } from 'lucide-react'

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReceiptsPage() {
  const [receipts, setReceipts]     = useState<any[]>([])
  const [ingredients, setIngredients] = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [uploading, setUploading]   = useState(false)
  const [tab, setTab]               = useState<'list'|'upload'|'reconcile'|'cogs'>('list')

  const loadReceipts = useCallback(async () => {
    const res = await fetch('/api/receipts')
    setReceipts(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    import('@/lib/supabase').then(({ supabase }) => {
      supabase.from('ingredients').select('id, code, name').eq('active', true).order('sort_order')
        .then(({ data }) => setIngredients(data || []))
    })
  }, [])

  useEffect(() => { loadReceipts() }, [loadReceipts])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1]
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64 })
      })
      const data = await res.json()
      if (data.ocr_failed) toast.error('OCR failed — use manual entry below')
      else toast.success('Receipt processed! Review matches below.')
      setUploading(false)
      loadReceipts()
      setTab('list')
    }
    reader.readAsDataURL(file)
  }

  const updateLineMatch = async (lineId: string, ingredientId: string | null) => {
    const sb = (await import('@/lib/supabase')).supabase
    await sb.from('receipt_line_items')
      .update({ matched_ingredient_id: ingredientId || null, status: 'pending' })
      .eq('id', lineId)
    toast.success('Match updated')
    loadReceipts()
  }

  const confirmLine = async (line: any, receiptId: string, vendorName: string) => {
    const sb = (await import('@/lib/supabase')).supabase
    await sb.from('receipt_line_items').update({ status: 'confirmed' }).eq('id', line.id)
    if (line.matched_ingredient_id && line.unit_price) {
      await sb.from('ingredients').update({ current_unit_cost: line.unit_price }).eq('id', line.matched_ingredient_id)
      await sb.from('cogs_log').insert({
        ingredient_id: line.matched_ingredient_id,
        receipt_id: receiptId,
        unit_price: line.unit_price,
        cost_per_recipe_unit: line.unit_price,
        notes: `From receipt: ${vendorName}`
      })
    }
    toast.success('Line confirmed & cost updated')
    loadReceipts()
  }

  const rejectLine = async (lineId: string) => {
    const sb = (await import('@/lib/supabase')).supabase
    await sb.from('receipt_line_items').update({ status: 'rejected' }).eq('id', lineId)
    loadReceipts()
  }

  const restoreLine = async (lineId: string) => {
    const sb = (await import('@/lib/supabase')).supabase
    await sb.from('receipt_line_items').update({ status: 'pending' }).eq('id', lineId)
    loadReceipts()
  }

  const confirmAll = async (receiptId: string, vendorName: string) => {
    const sb = (await import('@/lib/supabase')).supabase
    const { data: lines } = await sb.from('receipt_line_items')
      .select('*').eq('receipt_id', receiptId).gte('match_confidence', 0.8).neq('status', 'rejected')
    for (const line of lines || []) {
      await sb.from('receipt_line_items').update({ status: 'confirmed' }).eq('id', line.id)
      if (line.matched_ingredient_id && line.unit_price) {
        await sb.from('ingredients').update({ current_unit_cost: line.unit_price }).eq('id', line.matched_ingredient_id)
        await sb.from('cogs_log').insert({
          ingredient_id: line.matched_ingredient_id,
          receipt_id: receiptId,
          unit_price: line.unit_price,
          cost_per_recipe_unit: line.unit_price,
          notes: `Confirmed via receipt: ${vendorName}`
        })
      }
    }
    await sb.from('receipts').update({ status: 'confirmed' }).eq('id', receiptId)
    toast.success('All high-confidence lines confirmed!')
    loadReceipts()
  }

  const deleteReceipt = async (receiptId: string) => {
    if (!confirm('Delete this receipt?')) return
    const sb = (await import('@/lib/supabase')).supabase
    await sb.from('cogs_log').delete().eq('receipt_id', receiptId)
    await sb.from('receipt_line_items').delete().eq('receipt_id', receiptId)
    await sb.from('receipts').delete().eq('id', receiptId)
    toast.success('Receipt deleted')
    loadReceipts()
  }

  const updateReceiptDate = async (receiptId: string, newDate: string) => {
    const sb = (await import('@/lib/supabase')).supabase
    await sb.from('receipts').update({ receipt_date: newDate }).eq('id', receiptId)
    toast.success('Date updated!')
    loadReceipts()
  }

  const statusBadge = (s: string) => {
    const map: Record<string,any> = {
      confirmed: { label:'Confirmed', color:'green' },
      reviewing: { label:'Reviewing', color:'yellow' },
      rejected:  { label:'Rejected',  color:'red'   },
      pending:   { label:'Pending',   color:'gray'  },
    }
    const b = map[s] || map.pending
    return <Badge label={b.label} color={b.color} />
  }

  const confBadge = (conf: number) => {
    const pct = Math.round(conf * 100)
    const cls = conf >= 0.8
      ? 'bg-green-100 text-green-700'
      : conf >= 0.5
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-700'
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{pct}%</span>
  }

  const tabs = [
    { key:'list',      label:'Receipts'       },
    { key:'upload',    label:'Upload'         },
    { key:'reconcile', label:'Reconciliation' },
    { key:'cogs',      label:'COGS History'   },
  ]

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Receipts & COGS"
        sub="Upload receipts to auto-update inventory costs and track COGS"
        action={
          <div className="flex gap-2 flex-wrap">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t.key
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}>{t.label}</button>
            ))}
          </div>
        }
      />

      {/* ── Upload ── */}
      {tab === 'upload' && (
        <UploadSection
          uploading={uploading}
          onFileUpload={handleFileUpload}
          onTextParsed={() => { loadReceipts(); setTab('list') }}
        />
      )}

      {/* ── Receipt List ── */}
      {tab === 'list' && (
        loading ? <LoadingSpinner /> : (
          <div className="space-y-6">
            {receipts.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No receipts yet. Upload your first receipt!</p>
                </div>
              </Card>
            ) : receipts.map(r => (
              <Card key={r.id}>
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-base">
                      {r.vendor_name || <span className="text-amber-500 italic">No vendor — manual entry needed</span>}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="date"
                        defaultValue={r.receipt_date || ''}
                        onBlur={e => { if (e.target.value !== r.receipt_date) updateReceiptDate(r.id, e.target.value) }}
                        className="text-sm text-gray-500 border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
                      />
                      <span className="text-sm text-gray-400">· {r.receipt_line_items?.length || 0} items</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.total_amount && (
                      <span className="flex items-center gap-1 text-sm font-semibold text-gray-800">
                        <DollarSign className="w-4 h-4" />{Number(r.total_amount).toFixed(2)}
                      </span>
                    )}
                    {statusBadge(r.status)}
                    <button onClick={() => deleteReceipt(r.id)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* ── Manual entry for OCR-failed receipts ── */}
                {!r.vendor_name && (
                  <ManualEntryForm
                    receipt={r}
                    ingredients={ingredients}
                    onSaved={loadReceipts}
                  />
                )}

                {/* ── Line items (normal OCR receipts) ── */}
                {r.vendor_name && r.receipt_line_items?.length > 0 && (
                  <>
                    {/* Column headers */}
                    <div className="grid grid-cols-12 gap-2 px-3 pb-1 text-xs text-gray-400 font-medium">
                      <div className="col-span-4">Receipt line</div>
                      <div className="col-span-2 text-center">Qty / Price</div>
                      <div className="col-span-1 text-center">Conf.</div>
                      <div className="col-span-3">Matched to (editable)</div>
                      <div className="col-span-2 text-center">Action</div>
                    </div>

                    <div className="space-y-1.5">
                      {r.receipt_line_items
                        .filter((l: any) => l.status !== 'rejected')
                        .sort((a: any, b: any) => Number(b.match_confidence) - Number(a.match_confidence))
                        .map((line: any) => {
                          const conf = Number(line.match_confidence) || 0
                          const rowBg = conf >= 0.8
                            ? 'bg-green-50 border-green-100'
                            : conf >= 0.5
                            ? 'bg-yellow-50 border-yellow-100'
                            : 'bg-red-50 border-red-100'
                          return (
                            <div key={line.id} className={`grid grid-cols-12 gap-2 items-center border rounded-lg px-3 py-2 ${rowBg}`}>
                              <div className="col-span-4 min-w-0">
                                <p className="text-xs font-mono text-gray-600 truncate" title={line.raw_text}>{line.raw_text}</p>
                              </div>
                              <div className="col-span-2 text-center">
                                <p className="text-xs text-gray-600">{line.quantity || '?'} {line.unit}</p>
                                {line.unit_price && <p className="text-xs text-gray-500">${Number(line.unit_price).toFixed(2)}</p>}
                              </div>
                              <div className="col-span-1 flex justify-center">
                                {confBadge(conf)}
                              </div>
                              <div className="col-span-3">
                                <select
                                  value={line.matched_ingredient_id || ''}
                                  onChange={e => updateLineMatch(line.id, e.target.value || null)}
                                  className="w-full text-xs border border-gray-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                                >
                                  <option value="">— Not an ingredient —</option>
                                  {ingredients.map(ing => (
                                    <option key={ing.id} value={ing.id}>{ing.code} · {ing.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="col-span-2 flex justify-center gap-1">
                                {line.status === 'pending' ? (
                                  <>
                                    <button
                                      onClick={() => confirmLine(line, r.id, r.vendor_name)}
                                      disabled={!line.matched_ingredient_id}
                                      title={line.matched_ingredient_id ? 'Confirm & update cost' : 'Select an ingredient first'}
                                      className="p-1.5 text-green-600 hover:bg-green-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">
                                      <CheckCircle className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => rejectLine(line.id)} title="Skip this line"
                                      className="p-1.5 text-red-400 hover:bg-red-100 rounded">
                                      <XCircle className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-xs text-green-600 font-medium">✓ done</span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                    </div>

                    {/* Rejected lines */}
                    {r.receipt_line_items.some((l: any) => l.status === 'rejected') && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 px-1">
                          {r.receipt_line_items.filter((l: any) => l.status === 'rejected').length} skipped lines
                        </summary>
                        <div className="mt-1 space-y-1">
                          {r.receipt_line_items.filter((l: any) => l.status === 'rejected').map((line: any) => (
                            <div key={line.id} className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-100 rounded text-xs text-gray-400">
                              <span className="flex-1 font-mono truncate">{line.raw_text}</span>
                              <button onClick={() => restoreLine(line.id)} className="text-brand-500 hover:underline">restore</button>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {r.status === 'reviewing' && (
                      <div className="mt-4 flex items-center justify-between pt-3 border-t border-gray-100">
                        <p className="text-xs text-gray-500">Fix any wrong matches above, then confirm</p>
                        <button onClick={() => confirmAll(r.id, r.vendor_name)}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
                          <CheckCircle className="w-4 h-4" />
                          Confirm All ≥80% Items
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

      {tab === 'reconcile' && <ReconcileView />}
      {tab === 'cogs' && <COGSView />}
    </div>
  )
}

// ─── Upload Section (Image + Paste Text) ─────────────────────────────────────

function UploadSection({ uploading, onFileUpload, onTextParsed }: {
  uploading: boolean
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onTextParsed: () => void
}) {
  const [mode, setMode]         = useState<'image'|'text'>('image')
  const [pasteText, setPasteText] = useState('')
  const [parsing, setParsing]   = useState(false)

  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) { toast.error('Paste receipt text first'); return }
    setParsing(true)
    try {
      const res = await fetch('/api/receipts/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText })
      })
      const data = await res.json()
      if (data.error) {
        toast.error(`Parse failed: ${data.error}`)
      } else {
        toast.success(`Receipt parsed — ${data.line_count} items found. Review matches below.`)
        setPasteText('')
        onTextParsed()
      }
    } catch (e) {
      toast.error('Failed to parse receipt')
    }
    setParsing(false)
  }

  return (
    <Card>
      <h2 className="font-semibold text-gray-900 mb-4">Add Receipt</h2>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setMode('image')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === 'image' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          📷 Upload Image
        </button>
        <button onClick={() => setMode('text')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === 'text' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          📋 Paste Text
        </button>
      </div>

      {/* Image upload */}
      {mode === 'image' && (
        <>
          <p className="text-sm text-gray-500 mb-4">Take a photo or screenshot of your receipt.</p>
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
            <input type="file" accept="image/*" className="hidden" onChange={onFileUpload} />
          </label>
        </>
      )}

      {/* Text paste */}
      {mode === 'text' && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            Copy the receipt text from your email or PDF and paste it below. AI will extract all items automatically.
          </p>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="Paste receipt text here..."
            rows={16}
            className="w-full text-xs font-mono border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-y bg-gray-50"
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-gray-400">{pasteText.length} characters</p>
            <div className="flex gap-2">
              <button onClick={() => setPasteText('')} disabled={!pasteText}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30">
                Clear
              </button>
              <button onClick={handlePasteSubmit} disabled={parsing || !pasteText.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {parsing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Parse Receipt
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

// ─── Manual Entry Form ────────────────────────────────────────────────────────

function ManualEntryForm({ receipt, ingredients, onSaved }: {
  receipt: any
  ingredients: any[]
  onSaved: () => void
}) {
  const [vendor, setVendor]   = useState(receipt.vendor_name || '')
  const [date, setDate]       = useState(receipt.receipt_date || new Date().toISOString().split('T')[0])
  const [total, setTotal]     = useState(receipt.total_amount || '')
  const [saving, setSaving]   = useState(false)
  const [lines, setLines]     = useState<any[]>([
    { ingredientId: '', qty: '1', unit: 'CS', unitPrice: '', totalPrice: '' }
  ])

  const UNITS = ['CS','EA','LB','OZ','PK','BX','BG','CT']

  const addLine = () =>
    setLines(l => [...l, { ingredientId: '', qty: '1', unit: 'CS', unitPrice: '', totalPrice: '' }])

  const removeLine = (i: number) =>
    setLines(l => l.filter((_, idx) => idx !== i))

  const updateLine = (i: number, field: string, val: string) => {
    setLines(l => l.map((line, idx) => {
      if (idx !== i) return line
      const updated = { ...line, [field]: val }
      if ((field === 'qty' || field === 'unitPrice') && updated.qty && updated.unitPrice) {
        updated.totalPrice = (parseFloat(updated.qty) * parseFloat(updated.unitPrice)).toFixed(2)
      }
      return updated
    }))
  }

  const save = async () => {
    if (!vendor || !date) { toast.error('Vendor and date are required'); return }
    setSaving(true)
    const sb = (await import('@/lib/supabase')).supabase

    await sb.from('receipts').update({
      vendor_name: vendor,
      receipt_date: date,
      total_amount: total ? parseFloat(total) : null,
      status: 'reviewing'
    }).eq('id', receipt.id)

    const validLines = lines.filter(l => l.ingredientId && l.unitPrice)
    for (const line of validLines) {
      const ing = ingredients.find(i => i.id === line.ingredientId)
      await sb.from('receipt_line_items').insert({
        receipt_id: receipt.id,
        raw_text: ing ? `${ing.code} — ${ing.name} (manual)` : 'Manual entry',
        matched_ingredient_id: line.ingredientId,
        match_confidence: 1.0,
        quantity: parseFloat(line.qty) || null,
        unit: line.unit || null,
        unit_price: parseFloat(line.unitPrice),
        total_price: line.totalPrice ? parseFloat(line.totalPrice) : null,
        status: 'pending'
      })
    }

    toast.success(`Receipt saved with ${validLines.length} line item${validLines.length !== 1 ? 's' : ''}`)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-4">
      <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5" />
        OCR could not read this receipt — enter the details manually
      </p>

      {/* Vendor / Date / Total */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-600 mb-1 block font-medium">Vendor *</label>
          <input value={vendor} onChange={e => setVendor(e.target.value)}
            placeholder="e.g. ChefStore"
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400" />
        </div>
        <div>
          <label className="text-xs text-gray-600 mb-1 block font-medium">Date *</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400" />
        </div>
        <div>
          <label className="text-xs text-gray-600 mb-1 block font-medium">Total ($)</label>
          <input type="number" step="0.01" value={total} onChange={e => setTotal(e.target.value)}
            placeholder="0.00"
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400" />
        </div>
      </div>

      {/* Line items */}
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Line items</p>
        <div className="grid grid-cols-12 gap-2 mb-1 text-xs text-gray-400 px-1">
          <div className="col-span-5">Ingredient</div>
          <div className="col-span-1 text-center">Qty</div>
          <div className="col-span-1 text-center">Unit</div>
          <div className="col-span-2 text-center">Unit $</div>
          <div className="col-span-2 text-center">Total $</div>
          <div className="col-span-1"></div>
        </div>
        <div className="space-y-1.5">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center bg-white border border-gray-200 rounded-lg px-2 py-1.5">
              <div className="col-span-5">
                <select value={line.ingredientId} onChange={e => updateLine(i, 'ingredientId', e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400">
                  <option value="">— Select ingredient —</option>
                  {ingredients.map(ing => (
                    <option key={ing.id} value={ing.id}>{ing.code} · {ing.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-1">
                <input type="number" value={line.qty} onChange={e => updateLine(i, 'qty', e.target.value)}
                  placeholder="1"
                  className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-brand-400" />
              </div>
              <div className="col-span-1">
                <select value={line.unit} onChange={e => updateLine(i, 'unit', e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded px-1 py-1 bg-white focus:outline-none">
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <input type="number" step="0.01" value={line.unitPrice} onChange={e => updateLine(i, 'unitPrice', e.target.value)}
                  placeholder="0.00"
                  className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-brand-400" />
              </div>
              <div className="col-span-2">
                <input type="number" step="0.01" value={line.totalPrice} onChange={e => updateLine(i, 'totalPrice', e.target.value)}
                  placeholder="auto"
                  className="w-full text-xs border border-gray-100 bg-gray-50 rounded px-1.5 py-1 text-center text-gray-500 focus:outline-none" />
              </div>
              <div className="col-span-1 flex justify-center">
                {lines.length > 1 && (
                  <button onClick={() => removeLine(i)} title="Remove"
                    className="p-1 text-red-400 hover:bg-red-50 rounded">
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button onClick={addLine}
          className="mt-2 text-xs text-brand-600 hover:underline">
          + Add another line
        </button>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50">
          <CheckCircle className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Receipt'}
        </button>
      </div>
    </div>
  )
}

// ─── Reconciliation ───────────────────────────────────────────────────────────

function ReconcileView() {
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string|null>(null)

  const load = async () => {
    setLoading(true)
    try { const res = await fetch('/api/reconcile'); setData(await res.json()) }
    catch (e) { console.error('Reconcile load error:', e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const confirmMatch = async (receiptId: string, txnId: string) => {
    setActing(receiptId)
    await fetch('/api/reconcile', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ receipt_id: receiptId, txn_id: txnId, action:'confirm' })
    })
    toast.success('Match confirmed!')
    setActing(null); load()
  }

  const unmatch = async (receiptId: string, txnId: string) => {
    await fetch('/api/reconcile', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ receipt_id: receiptId, txn_id: txnId, action:'unmatch' })
    })
    toast.success('Match removed'); load()
  }

  if (loading) return <LoadingSpinner />

  const suggested: any[] = data?.suggested || []
  const confirmed: any[] = data?.confirmed || []
  const unmatched: any[] = data?.unmatched || []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label:'Confirmed matches', val:confirmed.length, bg:'green' },
          { label:'Suggested matches', val:suggested.length, bg:'yellow' },
          { label:'No bank match',     val:unmatched.length, bg:'red'   },
        ].map(({ label, val, bg }) => (
          <div key={label} className={`bg-${bg}-50 border border-${bg}-100 rounded-xl p-4`}>
            <p className={`text-xs text-${bg}-600 mb-1`}>{label}</p>
            <p className={`text-2xl font-semibold text-${bg}-700`}>{val}</p>
          </div>
        ))}
      </div>

      {suggested.length > 0 && (
        <Card>
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-500" />
            Suggested matches — review and confirm
          </h2>
          <div className="space-y-3">
            {suggested.map((m: any) => (
              <div key={m.receipt_id} className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-100 rounded-lg flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{m.vendor_name}</p>
                  <p className="text-xs text-gray-500">{m.receipt_date} · ${Number(m.total_amount).toFixed(2)}</p>
                </div>
                <div className="text-gray-400 text-xs px-2">↔</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{m.description}</p>
                  <p className="text-xs text-gray-500">{m.transaction_date} · ${Number(m.debit_amount).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {Number(m.amount_diff) === 0 ? 'exact' : `±$${Number(m.amount_diff).toFixed(2)}`}
                    {Number(m.day_diff) > 0 ? `, ${m.day_diff}d` : ''}
                  </span>
                  <button onClick={() => confirmMatch(m.receipt_id, m.txn_id)} disabled={acting === m.receipt_id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50">
                    <CheckCircle className="w-3 h-3" /> Confirm
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {confirmed.length > 0 && (
        <Card>
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" /> Confirmed matches
          </h2>
          <div className="space-y-2">
            {confirmed.map((m: any) => (
              <div key={m.receipt_id} className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-lg flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{m.vendor_name}</p>
                  <p className="text-xs text-gray-500">{m.receipt_date} · ${Number(m.total_amount).toFixed(2)}</p>
                </div>
                <div className="text-gray-400 text-xs px-2">↔</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{m.description}</p>
                  <p className="text-xs text-gray-500">{m.transaction_date} · ${Number(m.debit_amount).toFixed(2)}</p>
                </div>
                <button onClick={() => unmatch(m.receipt_id, m.txn_id)}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">Unmatch</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {unmatched.length > 0 && (
        <Card>
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400" /> No bank transaction found
          </h2>
          <p className="text-xs text-gray-500 mb-3">No matching bank transaction within $1 and 3 days.</p>
          <div className="space-y-2">
            {unmatched.map((r: any) => (
              <div key={r.receipt_id} className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-800">{r.vendor_name}</p>
                  <p className="text-xs text-gray-500">{r.receipt_date}</p>
                </div>
                <span className="text-sm font-semibold text-gray-700">${Number(r.total_amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {suggested.length === 0 && confirmed.length === 0 && unmatched.length === 0 && (
        <Card>
          <div className="text-center py-12">
            <GitMerge className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No confirmed receipts to reconcile</p>
            <p className="text-sm text-gray-400 mt-1">Confirm receipts in the Receipts tab first</p>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── COGS ─────────────────────────────────────────────────────────────────────

function COGSView() {
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations]   = useState<any[]>([])
  const [weekStart, setWeekStart]   = useState('')
  const [data, setData]             = useState<any>(null)
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    const { format: fmt, startOfWeek: sow } = require('date-fns')
    setWeekStart(fmt(sow(new Date(), { weekStartsOn:1 }), 'yyyy-MM-dd'))
    import('@/lib/supabase').then(({ supabase }) => {
      supabase.from('locations').select('*').eq('active',true).eq('type','newport')
        .then(({ data: locs }) => {
          setLocations(locs || [])
          if (locs?.[0]) setLocationId(locs[0].id)
        })
    })
  }, [])

  useEffect(() => {
    if (!locationId || !weekStart) return
    setLoading(true)
    fetch(`/api/cogs?location_id=${locationId}&week_start=${weekStart}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [locationId, weekStart])

  const totalCOGS = data?.cogs?.reduce((sum: number, c: any) => sum + (c.totalCost||0), 0) || 0

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <select value={locationId} onChange={e => setLocationId(e.target.value)}
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
        data.cogs.filter((c:any) => c.totalCost > 0).length === 0 ? (
          <Card>
            <div className="text-center py-12 text-gray-500">
              <p className="font-medium">No COGS data yet</p>
              <p className="text-sm mt-1">Confirm receipts first</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
            {data.cogs.filter((c:any) => c.totalCost > 0).map((ctx: any) => (
              <Card key={ctx.context}>
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold text-gray-900">{ctx.label}</h3>
                  <span className="text-sm font-bold text-brand-700">${ctx.totalCost.toFixed(2)}</span>
                </div>
                {ctx.costPerOrder !== undefined && (
                  <p className="text-xs text-gray-500 mb-3">
                    Cost per order: <span className="font-semibold text-gray-700">${(ctx.costPerOrder||0).toFixed(2)}</span>
                  </p>
                )}
                {ctx.costPerBatch !== undefined && (
                  <p className="text-xs text-gray-500 mb-3">
                    Cost per batch: <span className="font-semibold text-gray-700">${(ctx.costPerBatch||0).toFixed(2)}</span>
                  </p>
                )}
                <div className="space-y-1 mt-2 border-t border-gray-50 pt-2">
                  {ctx.ingredients.filter((i:any) => i.totalCost > 0).slice(0,6).map((ing: any) => (
                    <div key={ing.code} className="flex justify-between text-xs">
                      <span className="text-gray-600">{ing.name}</span>
                      <span className="text-gray-700 font-medium">${ing.totalCost.toFixed(2)}</span>
                    </div>
                  ))}
                  {ctx.ingredients.filter((i:any) => i.totalCost > 0).length > 6 && (
                    <p className="text-xs text-gray-400 text-right">
                      +{ctx.ingredients.filter((i:any) => i.totalCost > 0).length - 6} more
                    </p>
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
