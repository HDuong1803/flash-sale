import { CampaignCardSkeleton } from '@/components/shared/skeletons/CampaignCardSkeleton'

export default function AppLoading() {
  return (
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <CampaignCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
