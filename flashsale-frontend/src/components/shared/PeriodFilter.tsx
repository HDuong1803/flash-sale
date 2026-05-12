'use client'

type Period = { label: string; days: number }

const PERIODS: Period[] = [
  { label: 'Tuần', days: 7 },
  { label: 'Tháng', days: 30 },
  { label: 'Quý', days: 90 },
  { label: 'Năm', days: 365 },
]

export function PeriodFilter({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <div className="flex gap-1">
      {PERIODS.map(p => (
        <button
          key={p.days}
          onClick={() => onChange(p.days)}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            value === p.days
              ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
