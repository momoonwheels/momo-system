'use client'
import { startOfWeek, format, addWeeks, subWeeks } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

export default function WeekSelector({ onChange }: { onChange: (weekStart: string) => void }) {
  const [week, setWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const change = (d: Date) => { setWeek(d); onChange(format(d, 'yyyy-MM-dd')) }
  return (
    <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
      <button onClick={() => change(subWeeks(week,1))} className="p-1 rounded hover:bg-gray-100 touch-manipulation">
        <ChevronLeft className="w-4 h-4 text-gray-500" />
      </button>
      <span className="text-xs lg:text-sm font-medium text-gray-700 min-w-24 lg:min-w-32 text-center">
        {format(week,'MMM d, yy')}
      </span>
      <button onClick={() => change(addWeeks(week,1))} className="p-1 rounded hover:bg-gray-100 touch-manipulation">
        <ChevronRight className="w-4 h-4 text-gray-500" />
      </button>
    </div>
  )
}