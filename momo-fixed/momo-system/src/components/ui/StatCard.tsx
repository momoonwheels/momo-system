import { LucideIcon } from 'lucide-react'
export default function StatCard({ label, value, sub, icon: Icon, color = 'brand' }:
  { label: string; value: string|number; sub?: string; icon: LucideIcon; color?: string }) {
  const colors: Record<string,string> = {
    brand: 'bg-brand-50 text-brand-600', blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600', purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${colors[color]||colors.brand}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}