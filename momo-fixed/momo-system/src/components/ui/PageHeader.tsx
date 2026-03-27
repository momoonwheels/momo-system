export default function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {sub && <p className="text-sm text-gray-500 mt-1">{sub}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}