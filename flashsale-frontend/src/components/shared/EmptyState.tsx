import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="glass rounded-full p-6 mb-4">
        <Icon size={32} className="text-white/20" />
      </div>
      <h3 className="text-white/70 font-semibold text-lg mb-2">{title}</h3>
      {description && (
        <p className="text-white/40 text-sm max-w-xs">{description}</p>
      )}
      {action && (
        <button onClick={action.onClick} className="btn-primary mt-4 text-sm">
          {action.label}
        </button>
      )}
    </div>
  )
}
