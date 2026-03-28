export default function LoadingSpinner({ size = 'md' }: { size?: 'sm'|'md'|'lg' }) {
  const sz = { sm:'w-4 h-4', md:'w-8 h-8', lg:'w-12 h-12' }[size]
  return (
    <div className="flex items-center justify-center p-8">
      <div className={`${sz} border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin`} />
    </div>
  )
}