'use client'
import { startOfWeek, format, addWeeks, subWeeks } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

export default function WeekSelector({ onChange }: { onChange: (weekStart: string) => void }) {
  const [week, setWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const change = (d: Date) => { setWeek(d); onChange(format(d, 'yyyy-MM-dd')) }
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => change(subWeeks(week,1))} className="p-1.5 rounded-lg hover:bg-gray-100">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium text-gray-700 min-w-32 text-center">
        Week of {format(week,'MMM d, yyyy')}
      </span>
      <button onClick={() => change(addWeeks(week,1))} className="p-1.5 rounded-lg hover:bg-gray-100">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}