import { cn } from '@/lib/utils'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'brand' | 'strong'
  shimmer?: boolean
}

export function GlassCard({ children, className, variant = 'default', shimmer = false }: GlassCardProps) {
  const variants = {
    default: 'glass',
    brand: 'glass-brand',
    strong: 'glass-strong',
  }
  return (
    <div className={cn('rounded-2xl relative overflow-hidden', variants[variant], className)}>
      {shimmer && (
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full
          bg-gradient-to-r from-transparent via-white/5 to-transparent
          transition-transform duration-700 pointer-events-none" />
      )}
      {children}
    </div>
  )
}
