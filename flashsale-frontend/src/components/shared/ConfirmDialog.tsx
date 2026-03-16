'use client'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  loading?: boolean
}

export function ConfirmDialog({
  open, onConfirm, onCancel, title, description,
  confirmLabel = 'Xác nhận', cancelLabel = 'Hủy',
  variant = 'default', loading = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="glass-strong border-white/15 rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription className="text-white/60">{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <button onClick={onCancel} className="btn-glass text-sm px-4 py-2" disabled={loading}>
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'text-sm px-4 py-2 rounded-xl font-medium transition-all disabled:opacity-50',
              variant === 'destructive'
                ? 'bg-red-500/80 hover:bg-red-500 text-white glow-error'
                : 'btn-primary',
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang xử lý...
              </span>
            ) : confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
