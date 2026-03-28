export default function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4 lg:mb-6 gap-3">
      <div className="min-w-0">
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900 truncate">{title}</h1>
        {sub && <p className="text-xs lg:text-sm text-gray-500 mt-0.5">{sub}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}