'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import { AlertTriangle, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'
import { useDeadLetterJobs } from '@/hooks/queries/useDeadLetterJobs'
import { useRetryJob } from '@/hooks/mutations/useRetryJob'
import { useDiscardJob } from '@/hooks/mutations/useDiscardJob'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { formatDate } from '@/lib/utils'

const AUTO_REFRESH_SECONDS = 30

export default function DeadLetterQueuePage() {
  const { data: jobs, loading, error, refetch } = useDeadLetterJobs()
  const { mutate: retry, loading: retrying } = useRetryJob()
  const { discard, loading: discarding } = useDiscardJob()
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null)

  const doRefresh = useCallback(() => {
    refetch()
    setCountdown(AUTO_REFRESH_SECONDS)
  }, [refetch])

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { doRefresh(); return AUTO_REFRESH_SECONDS }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [doRefresh])

  const handleRetryAll = async () => {
    await Promise.allSettled(jobs.map((j) => retry(j.id)))
    refetch()
  }

  const handleDiscard = async (id: string) => {
    try { await discard(id); refetch() } catch {}
    setConfirmDiscard(null)
  }

  const TYPE_COLORS: Record<string, string> = {
    ORDER_PROCESSING: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
    PAYMENT: 'bg-red-500/15 text-red-300 border-red-500/20',
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <AlertTriangle size={24} className={jobs.length > 0 ? 'text-red-400' : 'text-white/30'} />
          <div>
            <h1 className="text-white text-2xl font-bold">Dead Letter Queue</h1>
            <p className={`text-sm ${jobs.length > 0 ? 'text-red-400' : 'text-white/40'}`}>
              {jobs.length} công việc thất bại {jobs.length > 0 ? 'cần xử lý' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/30 text-xs">Tự động làm mới sau: {countdown}s</span>
          <button onClick={doRefresh} className="btn-glass flex items-center gap-2 text-sm">
            <RotateCcw size={14} /> Làm mới
          </button>
          <button onClick={handleRetryAll} disabled={jobs.length === 0 || retrying} className="btn-primary text-sm disabled:opacity-40">
            Retry Tất Cả
          </button>
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-4 space-y-3 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white/8 h-16 rounded-xl" />)}
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-6 text-center">
          <p className="text-red-400 text-sm mb-3">{error}</p>
          <button onClick={refetch} className="btn-glass text-sm">Thử lại</button>
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Không có công việc thất bại" description="Hệ thống hoạt động bình thường." />
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 w-8" />
                  {['Loại', 'Mã job', 'Lỗi', 'Thất bại lúc', 'Retry', 'Hành động'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-white/40 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <Fragment key={job.id}>
                    <tr className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => setExpandedId(expandedId === job.id ? null : job.id)} className="text-white/30 hover:text-white/60 transition-colors">
                          {expandedId === job.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${TYPE_COLORS[job.type] ?? 'bg-white/10 text-white/50 border-white/15'}`}>
                          {job.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs font-mono">{job.id.slice(0, 12)}...</td>
                      <td className="px-4 py-3 text-white/60 text-sm max-w-[200px]">
                        <p className="line-clamp-1" title={job.errorMessage}>{job.errorMessage}</p>
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs">{formatDate(job.failedAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold ${job.retryCount >= 4 ? 'text-red-400' : 'text-white/50'}`}>
                          {job.retryCount}/4
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => retry(job.id).then(() => refetch())} disabled={retrying}
                            className="text-xs px-3 py-1.5 rounded-xl bg-orange-500/15 text-orange-300 border border-orange-500/20 hover:bg-orange-500/25 transition-all disabled:opacity-50">
                            Retry
                          </button>
                          <button onClick={() => setConfirmDiscard(job.id)}
                            className="text-xs px-3 py-1.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all">
                            Loại bỏ
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === job.id && (
                      <tr className="border-b border-white/5">
                        <td colSpan={7} className="px-8 py-4 bg-black/20">
                          <p className="text-white/40 text-xs font-semibold uppercase mb-2">Payload</p>
                          <pre className="text-white/60 text-xs font-mono bg-black/30 rounded-xl p-3 overflow-x-auto">
                            {JSON.stringify(job.payload, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDiscard}
        title="Loại bỏ job này?"
        description="Job sẽ bị xóa vĩnh viễn và không thể khôi phục."
        confirmLabel="Loại bỏ"
        cancelLabel="Hủy"
        variant="destructive"
        onConfirm={() => confirmDiscard && handleDiscard(confirmDiscard)}
        onCancel={() => setConfirmDiscard(null)}
        loading={discarding}
      />
    </div>
  )
}
