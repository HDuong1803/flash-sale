import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationBarProps {
  total: number
  page: number
  pageSize: number
  onPage: (page: number) => void
  className?: string
}

export function PaginationBar({ total, page, pageSize, onPage, className = '' }: PaginationBarProps) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  const start = page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, total)

  const pages: (number | 'ellipsis')[] = []
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i)
  } else {
    pages.push(0)
    if (page > 2) pages.push('ellipsis')
    for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) {
      pages.push(i)
    }
    if (page < totalPages - 3) pages.push('ellipsis')
    pages.push(totalPages - 1)
  }

  return (
    <div className={`flex items-center justify-between flex-wrap gap-3 ${className}`}>
      <p className="text-white/40 text-sm">
        {start}–{end} / {total} mục
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
          className="p-2 glass rounded-xl text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Trang trước"
        >
          <ChevronLeft size={14} />
        </button>

        {pages.map((p, idx) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="px-1 text-white/30 text-sm select-none">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`w-8 h-8 rounded-xl text-sm font-medium transition-all ${
                p === page
                  ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40'
                  : 'glass text-white/50 hover:text-white'
              }`}
            >
              {p + 1}
            </button>
          )
        )}

        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages - 1}
          className="p-2 glass rounded-xl text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Trang tiếp"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
