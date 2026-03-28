import { clsx } from 'clsx'
const colors = {
  green:  'bg-green-100 text-green-800',
  red:    'bg-red-100 text-red-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  blue:   'bg-blue-100 text-blue-800',
  gray:   'bg-gray-100 text-gray-700',
  brand:  'bg-brand-100 text-brand-800',
}
export default function Badge({ label, color='gray' }: { label: string; color?: keyof typeof colors }) {
  return <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', colors[color])}>{label}</span>
}