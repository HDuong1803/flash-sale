'use client'

import { useState, useEffect, useRef } from 'react'
import { Users, AlertCircle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminUsers } from '@/hooks/queries/useAdminUsers'
import { useSuspendUser } from '@/hooks/mutations/useSuspendUser'
import { useActivateUser } from '@/hooks/mutations/useActivateUser'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { formatDate } from '@/lib/utils'
import { adminService } from '@/services/admin.service'
import type { UserRole } from '@/types'

const ROLES: { label: string; value: UserRole | '' }[] = [
  { label: 'Tất cả', value: '' },
  { label: 'Khách hàng', value: 'CUSTOMER' },
  { label: 'Người bán', value: 'MERCHANT' },
  { label: 'Quản trị viên', value: 'ADMIN' },
]

const ROLE_COLORS: Record<UserRole, string> = {
  CUSTOMER: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  MERCHANT: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20',
  ADMIN: 'bg-red-500/15 text-red-300 border-red-500/20',
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'suspend' | 'activate' } | null>(null)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkSuspending, setBulkSuspending] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  const { data: users, loading, error, refetch } = useAdminUsers(
    roleFilter || debouncedSearch ? { role: roleFilter || undefined, search: debouncedSearch || undefined } : undefined
  )
  const { mutate: suspend, loading: suspending } = useSuspendUser()
  const { activate, loading: activating } = useActivateUser()

  const handleAction = async () => {
    if (!confirmAction) return
    try {
      if (confirmAction.action === 'suspend') await suspend(confirmAction.id)
      else await activate(confirmAction.id)
      refetch()
    } catch {} finally {
      setConfirmAction(null)
    }
  }

  const handleBulkSuspend = async () => {
    if (selected.size === 0) return
    setBulkSuspending(true)
    try {
      await Promise.all(Array.from(selected).map((id) => adminService.suspendUser(id)))
      toast.success(`Đã đình chỉ ${selected.size} người dùng`)
      setSelected(new Set())
      refetch()
    } catch {
      toast.error('Có lỗi xảy ra khi đình chỉ người dùng')
    } finally {
      setBulkSuspending(false)
      setBulkConfirmOpen(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-white text-2xl font-bold">Quản lý Người dùng</h1>
        {selected.size > 0 && (
          <button
            onClick={() => setBulkConfirmOpen(true)}
            className="btn-glass text-sm text-red-300 border-red-500/20"
          >
            Đình chỉ {selected.size} người dùng
          </button>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input-glass pl-9" placeholder="Tìm theo tên, email..." />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as UserRole | '')} className="input-glass w-auto min-w-36">
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="glass rounded-2xl overflow-hidden animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex gap-4 px-6 py-4 border-b border-white/5"><div className="bg-white/8 h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><div className="bg-white/8 h-4 w-1/3 rounded" /><div className="bg-white/8 h-3 w-1/4 rounded" /></div></div>)}
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <button onClick={refetch} className="btn-glass text-sm px-4 py-2">Thử lại</button>
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="Không tìm thấy người dùng" description="Thử thay đổi bộ lọc tìm kiếm" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 w-10"><input type="checkbox" className="accent-red-500" onChange={(e) => { if (e.target.checked) setSelected(new Set(users.map((u) => u.id))); else setSelected(new Set()) }} /></th>
                  {['Tên', 'Email', 'Vai trò', 'Tham gia', 'Hành động'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-white/40 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3"><input type="checkbox" checked={selected.has(user.id)} onChange={() => toggleSelect(user.id)} className="accent-red-500" /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                          {user.fullName[0]}
                        </div>
                        <span className="text-white text-sm font-medium">{user.fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/60 text-sm">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${ROLE_COLORS[user.role]}`}>{user.role}</span>
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setConfirmAction({ id: user.id, action: 'suspend' })}
                        className="text-xs px-3 py-1.5 rounded-xl bg-orange-500/15 text-orange-300 border border-orange-500/20 hover:bg-orange-500/25 transition-all"
                      >
                        Đình chỉ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.action === 'suspend' ? 'Đình chỉ tài khoản?' : 'Kích hoạt tài khoản?'}
        description={confirmAction?.action === 'suspend' ? 'Người dùng sẽ không thể đăng nhập.' : 'Người dùng sẽ có thể đăng nhập lại.'}
        confirmLabel={confirmAction?.action === 'suspend' ? 'Đình chỉ' : 'Kích hoạt'}
        cancelLabel="Hủy"
        variant={confirmAction?.action === 'suspend' ? 'destructive' : 'default'}
        onConfirm={handleAction}
        onCancel={() => setConfirmAction(null)}
        loading={suspending || activating}
      />
      <ConfirmDialog
        open={bulkConfirmOpen}
        title={`Đình chỉ ${selected.size} người dùng?`}
        description="Các người dùng này sẽ không thể đăng nhập. Bạn có chắc chắn không?"
        confirmLabel="Đình chỉ tất cả"
        cancelLabel="Hủy"
        variant="destructive"
        onConfirm={handleBulkSuspend}
        onCancel={() => setBulkConfirmOpen(false)}
        loading={bulkSuspending}
      />
    </div>
  )
}
