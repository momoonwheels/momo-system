'use client'
import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Upload, Edit2, Check, X, Users, FileText } from 'lucide-react'

interface LaborEntryProps {
  startDate: string
  endDate: string
  savedWages: number
  onSaved: (wages: number) => void
}

interface ShiftRow {
  name: string
  hours: number
  wages: number
  tips: number
}

export default function LaborEntry({ startDate, endDate, savedWages, onSaved }: LaborEntryProps) {
  const [mode, setMode] = useState<'view'|'manual'|'csv'>('view')
  const [manualWages, setManualWages] = useState(savedWages > 0 ? savedWages.toFixed(2) : '')
  const [csvData, setCsvData] = useState<ShiftRow[]>([])
  const [csvTotal, setCsvTotal] = useState(0)
  const [saving, setSaving] = useState(false)
  const TAX_RATE = 0.0765

  const parseSquareCSV = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) return toast.error('Invalid CSV file')

    // Square timecard CSV headers vary - find wage/hours columns
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase())
    const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('employee'))
    const hoursIdx = headers.findIndex(h => h.includes('paid hours') || h.includes('regular hours') || h.includes('hours'))
    const wagesIdx = headers.findIndex(h => h.includes('wage') || h.includes('pay') || h.includes('gross'))
    const tipsIdx = headers.findIndex(h => h.includes('tip'))

    if (hoursIdx === -1 && wagesIdx === -1) {
      return toast.error('Could not find hours or wages columns in CSV')
    }

    const rows: ShiftRow[] = []
    let total = 0

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/"/g, '').replace(/\$/g, '').trim())
      if (!cols[0]) continue

      const name = nameIdx >= 0 ? cols[nameIdx] : `Employee ${i}`
      const hours = parseFloat(cols[hoursIdx] || '0') || 0
      const wages = parseFloat(cols[wagesIdx] || '0') || 0
      const tips = tipsIdx >= 0 ? parseFloat(cols[tipsIdx] || '0') || 0 : 0

      if (hours > 0 || wages > 0) {
        rows.push({ name, hours, wages, tips })
        total += wages
      }
    }

    if (rows.length === 0) return toast.error('No employee data found in CSV')

    setCsvData(rows)
    setCsvTotal(total)
    toast.success(`Found ${rows.length} employees — Total wages: $${total.toFixed(2)}`)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.csv')) return toast.error('Please upload a CSV file')
    const reader = new FileReader()
    reader.onload = ev => parseSquareCSV(ev.target?.result as string)
    reader.readAsText(file)
  }

  const save = async (wages: number, source: string, details?: any) => {
    if (!wages || wages <= 0) return toast.error('Enter valid wage amount')
    setSaving(true)
    const res = await fetch('/api/labor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, totalWages: wages, source, details })
    })
    if (res.ok) {
      toast.success('Labor saved!')
      onSaved(wages)
      setMode('view')
    } else toast.error('Failed to save')
    setSaving(false)
  }

  const taxes = savedWages * TAX_RATE
  const totalWithTax = savedWages + taxes

  return (
    <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" />
          <p className="text-xs font-semibold text-blue-700 uppercase">Labor (Square Payroll)</p>
        </div>
        {mode === 'view' && (
          <div className="flex gap-2">
            <button onClick={() => setMode('csv')}
              className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Upload className="w-3 h-3" /> Upload CSV
            </button>
            <button onClick={() => setMode('manual')}
              className="flex items-center gap-1 text-xs px-2 py-1 bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50">
              <Edit2 className="w-3 h-3" /> Manual Entry
            </button>
          </div>
        )}
        {mode !== 'view' && (
          <button onClick={() => setMode('view')}
            className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* View mode */}
      {mode === 'view' && (
        savedWages > 0 ? (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Wages</span>
              <span className="font-medium text-red-600">${savedWages.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Payroll Taxes (7.65%)</span>
              <span className="font-medium text-red-600">${taxes.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold border-t border-blue-200 pt-1 mt-1">
              <span>Total Labor Cost</span>
              <span className="text-red-600">${totalWithTax.toFixed(2)}</span>
            </div>
            <p className="text-xs text-blue-400 mt-1">Click "Manual Entry" or "Upload CSV" to update</p>
          </div>
        ) : (
          <p className="text-sm text-blue-500 text-center py-2">
            No labor data for this period. Upload a timecard CSV from Square or enter manually.
          </p>
        )
      )}

      {/* Manual entry mode */}
      {mode === 'manual' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Go to Square → Staff → Time Tracking → Timecards → note the <strong>Total Labor Cost</strong>
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Total Wages ($)</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">$</span>
                <input type="number" step="0.01" placeholder="e.g. 718.05"
                  value={manualWages}
                  onChange={e => setManualWages(e.target.value)}
                  className="flex-1 border border-blue-200 bg-white rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
                  autoFocus />
              </div>
            </div>
            {Number(manualWages) > 0 && (
              <div className="text-xs text-gray-500 text-right">
                <div>+ Tax: ${(Number(manualWages) * TAX_RATE).toFixed(2)}</div>
                <div className="font-bold">Total: ${(Number(manualWages) * (1 + TAX_RATE)).toFixed(2)}</div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setMode('view')} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={() => save(Number(manualWages), 'manual')} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              <Check className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* CSV upload mode */}
      {mode === 'csv' && (
        <div className="space-y-3">
          <div className="text-xs text-gray-500 bg-white rounded-lg p-3 border border-blue-100">
            <p className="font-semibold text-gray-700 mb-1">How to export from Square:</p>
            <ol className="list-decimal ml-4 space-y-0.5">
              <li>Go to Square → Staff → Time Tracking → Timecards</li>
              <li>Select the date range (e.g. Mar 17–22)</li>
              <li>Click <strong>Export</strong> → Download CSV</li>
              <li>Upload that file here</li>
            </ol>
          </div>

          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-blue-300 rounded-xl cursor-pointer bg-white hover:bg-blue-50 transition-colors">
            <Upload className="w-6 h-6 text-blue-400 mb-1" />
            <span className="text-sm text-blue-600 font-medium">Click to upload Square Timecard CSV</span>
            <span className="text-xs text-gray-400">or drag and drop</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>

          {csvData.length > 0 && (
            <div className="bg-white rounded-lg border border-blue-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <th className="text-left px-3 py-2">Employee</th>
                    <th className="text-center px-3 py-2">Hours</th>
                    <th className="text-right px-3 py-2">Wages</th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.map((row, i) => (
                    <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2 text-center">{row.hours.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium">${row.wages.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-blue-50 font-bold border-t-2 border-blue-200">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-center">{csvData.reduce((s,r)=>s+r.hours,0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-blue-700">${csvTotal.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="px-3 py-2 bg-blue-50 text-xs text-gray-500 flex justify-between">
                <span>+ Payroll taxes (7.65%): ${(csvTotal * TAX_RATE).toFixed(2)}</span>
                <span className="font-bold text-blue-700">Total with tax: ${(csvTotal * (1+TAX_RATE)).toFixed(2)}</span>
              </div>
            </div>
          )}

          {csvData.length > 0 && (
            <div className="flex justify-end gap-2">
              <button onClick={() => { setCsvData([]); setCsvTotal(0) }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Clear</button>
              <button onClick={() => save(csvTotal, 'csv', csvData)} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : `Save $${csvTotal.toFixed(2)}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
