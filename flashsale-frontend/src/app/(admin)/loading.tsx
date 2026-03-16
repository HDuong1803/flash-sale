import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton'

export default function AdminLoading() {
  return (
    <div className="p-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
