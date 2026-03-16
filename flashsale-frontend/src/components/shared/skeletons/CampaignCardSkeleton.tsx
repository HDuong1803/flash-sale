export function CampaignCardSkeleton() {
  return (
    <div className="glass rounded-2xl overflow-hidden animate-pulse">
      <div className="bg-white/8 h-48 w-full" />
      <div className="p-4 space-y-3">
        <div className="bg-white/8 h-5 w-3/4 rounded-lg" />
        <div className="bg-white/8 h-4 w-1/2 rounded-lg" />
        <div className="bg-white/8 h-3 w-full rounded-lg" />
        <div className="bg-white/8 h-10 w-full rounded-xl mt-2" />
      </div>
    </div>
  )
}
