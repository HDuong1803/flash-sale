export function OrderRowSkeleton() {
  return (
    <div className="glass rounded-xl p-4 animate-pulse flex items-center gap-4">
      <div className="bg-white/8 w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="bg-white/8 h-4 w-1/3 rounded-lg" />
        <div className="bg-white/8 h-3 w-1/2 rounded-lg" />
        <div className="bg-white/8 h-3 w-1/4 rounded-lg" />
      </div>
      <div className="bg-white/8 h-6 w-20 rounded-full flex-shrink-0" />
    </div>
  )
}
