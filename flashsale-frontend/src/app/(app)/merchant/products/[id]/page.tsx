'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  AlertCircle,
  Loader2,
  X,
  Upload,
  Check,
  Tag,
  Boxes,
  ImageIcon,
  Package,
  Zap,
  ChevronRight,
  Calendar,
  ExternalLink
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useProduct } from '@/hooks/queries/useProduct'
import { useUpdateProduct } from '@/hooks/mutations/useUpdateProduct'
import { useDeleteProduct } from '@/hooks/mutations/useDeleteProduct'
import { useDeleteProductImage } from '@/hooks/mutations/useDeleteProductImage'
import { useToggleProductStatus } from '@/hooks/mutations/useToggleProductStatus'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Switch } from '@/components/ui/switch'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { ProductImage, CampaignStatus } from '@/types'

const MAX_IMAGES = 10
const MAX_FILE_SIZE_MB = 5
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const schema = z.object({
  name: z.string().min(3, 'Tối thiểu 3 ký tự').max(200),
  description: z.string().max(1000).optional(),
  originalPrice: z.number().min(1000, 'Tối thiểu 1,000 ₫'),
})

type ProductForm = z.infer<typeof schema>

interface PendingImage {
  key: string
  file: File
  previewUrl: string
}

const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: 'Nháp',
  APPROVED: 'Đã duyệt',
  SCHEDULED: 'Đã lên lịch',
  ACTIVE: 'Đang chạy',
  ENDED: 'Đã kết thúc',
}

const CAMPAIGN_STATUS_COLOR: Record<CampaignStatus, string> = {
  DRAFT: 'text-white/40 bg-white/8 border-white/10',
  APPROVED: 'text-blue-300 bg-blue-500/15 border-blue-500/25',
  SCHEDULED: 'text-violet-300 bg-violet-500/15 border-violet-500/25',
  ACTIVE: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25',
  ENDED: 'text-white/35 bg-white/5 border-white/8',
}

// ─── Image Upload Zone ─────────────────────────────────────────────────────────

interface ImageUploadZoneProps {
  existingImages: ProductImage[]
  pendingImages: PendingImage[]
  onAddFiles: (files: File[]) => void
  onRemovePending: (key: string) => void
  onRemoveExisting: (imageId: string) => void
  removingId: string | null
}

function ImageUploadZone({
  existingImages,
  pendingImages,
  onAddFiles,
  onRemovePending,
  onRemoveExisting,
  removingId,
}: ImageUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const totalCount = existingImages.length + pendingImages.length

  const processFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return
      const remaining = MAX_IMAGES - totalCount
      if (remaining <= 0) return
      const valid: File[] = []
      for (let i = 0; i < Math.min(fileList.length, remaining); i++) {
        const f = fileList[i]
        if (!ACCEPTED_TYPES.includes(f.type)) continue
        if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) continue
        valid.push(f)
      }
      if (valid.length > 0) onAddFiles(valid)
    },
    [totalCount, onAddFiles]
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-white/60 text-sm">Hình ảnh</span>
        <span className="text-white/30 text-xs">{totalCount}/{MAX_IMAGES}</span>
      </div>

      {(existingImages.length > 0 || pendingImages.length > 0) && (
        <div className="grid grid-cols-5 gap-2">
          {existingImages.map(img => (
            <div key={img.id} className="relative group aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/8">
              <Image src={img.url} alt="" fill className="object-cover" sizes="80px" unoptimized />
              {img.isPrimary && (
                <div className="absolute bottom-0 inset-x-0 bg-indigo-500/85 text-white text-[9px] font-semibold text-center py-0.5">
                  Chính
                </div>
              )}
              <button
                type="button"
                onClick={() => onRemoveExisting(img.id)}
                disabled={removingId === img.id}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
              >
                {removingId === img.id ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />}
              </button>
            </div>
          ))}

          {pendingImages.map(img => (
            <div key={img.key} className="relative group aspect-square rounded-xl overflow-hidden bg-white/5 border border-indigo-500/30">
              <Image src={img.previewUrl} alt="" fill className="object-cover" sizes="80px" unoptimized />
              <div className="absolute inset-0 bg-indigo-900/30 flex items-end justify-center pb-1">
                <span className="text-white/60 text-[8px]">Chờ tải</span>
              </div>
              <button
                type="button"
                onClick={() => onRemovePending(img.key)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {totalCount < MAX_IMAGES && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            multiple
            className="hidden"
            onChange={e => { processFiles(e.target.files); e.target.value = '' }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); processFiles(e.dataTransfer.files) }}
            className={cn(
              'w-full border border-dashed rounded-xl p-4 flex flex-col items-center gap-1.5 transition-all text-sm',
              dragOver
                ? 'border-indigo-400/60 bg-indigo-500/10 text-indigo-300'
                : 'border-white/12 text-white/35 hover:border-white/25 hover:bg-white/3'
            )}
          >
            <Upload size={15} />
            <span className="text-xs">{totalCount === 0 ? 'Kéo thả hoặc nhấn chọn ảnh' : 'Thêm ảnh'}</span>
            <span className="text-white/25 text-[11px]">JPG, PNG, WebP · {MAX_FILE_SIZE_MB}MB/ảnh</span>
          </button>
        </>
      )}
    </div>
  )
}

// ─── Detail Page ───────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const { data: product, loading, error, refetch } = useProduct(id)
  const { updateProduct, loading: updating } = useUpdateProduct()
  const { deleteProduct, loading: deleting } = useDeleteProduct()
  const { deleteImage } = useDeleteProductImage()
  const { mutate: toggleStatus } = useToggleProductStatus()

  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Gallery
  const [activeIdx, setActiveIdx] = useState(0)

  // Edit form images
  const [existingImages, setExistingImages] = useState<ProductImage[]>([])
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [removingImageId, setRemovingImageId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProductForm>({ resolver: zodResolver(schema) })

  const priceValue = watch('originalPrice')

  const startEdit = () => {
    if (!product) return
    setExistingImages(product.images ?? [])
    setPendingImages([])
    reset({ name: product.name, description: product.description ?? '', originalPrice: product.originalPrice })
    setEditing(true)
  }

  const cancelEdit = () => {
    pendingImages.forEach(img => URL.revokeObjectURL(img.previewUrl))
    setPendingImages([])
    setExistingImages([])
    setEditing(false)
  }

  const handleAddFiles = (files: File[]) => {
    const newPending = files.map(f => ({
      key: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
    }))
    setPendingImages(prev => [...prev, ...newPending])
  }

  const handleRemovePending = (key: string) => {
    setPendingImages(prev => {
      const img = prev.find(p => p.key === key)
      if (img) URL.revokeObjectURL(img.previewUrl)
      return prev.filter(p => p.key !== key)
    })
  }

  const handleRemoveExisting = async (imageId: string) => {
    if (!product) return
    setRemovingImageId(imageId)
    try {
      await deleteImage(product.id, imageId)
      setExistingImages(prev => prev.filter(img => img.id !== imageId))
    } catch {
      // toast shown by hook
    } finally {
      setRemovingImageId(null)
    }
  }

  const onSubmit = async (data: ProductForm) => {
    if (!product) return
    try {
      await updateProduct(product.id, { name: data.name, description: data.description, originalPrice: data.originalPrice }, pendingImages.map(p => p.file))
      cancelEdit()
      refetch()
      setActiveIdx(0)
    } catch {
      // toast shown by hook
    }
  }

  const handleDelete = async () => {
    if (!product) return
    try {
      await deleteProduct(product.id)
      router.push('/merchant/products')
    } catch {
      setConfirmDelete(false)
    }
  }

  const handleToggle = async () => {
    if (!product) return
    await toggleStatus(product.id)
    refetch()
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/6 rounded-lg animate-pulse" />
          <div className="h-5 bg-white/6 rounded w-32 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 aspect-square bg-white/5 rounded-2xl animate-pulse" />
          <div className="lg:col-span-3 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="glass rounded-2xl p-10 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error ?? 'Không tìm thấy sản phẩm'}</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => router.back()} className="btn-glass text-sm px-4 py-2">Quay lại</button>
            {error && <button onClick={refetch} className="btn-glass text-sm px-4 py-2">Thử lại</button>}
          </div>
        </div>
      </div>
    )
  }

  const images = product.images ?? []
  const activeImage = images[activeIdx]?.url ?? product.imageUrl ?? null
  const isActive = product.status === 'ACTIVE'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/merchant/products"
          className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft size={14} />
          Sản phẩm
        </Link>
        <span className="text-white/20">/</span>
        <span className="text-white/60 truncate max-w-[200px]">{product.name}</span>
      </div>

      {/* Page actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-xs font-semibold px-2.5 py-1 rounded-full border',
            isActive
              ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25'
              : 'text-white/40 bg-white/8 border-white/10'
          )}>
            {isActive ? 'Đang bán' : 'Tạm dừng'}
          </span>
          <div className="flex items-center gap-1.5 ml-1">
            <Switch checked={isActive} onCheckedChange={handleToggle} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!editing && (
            <>
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-indigo-300 bg-indigo-500/12 border border-indigo-500/25 rounded-xl hover:bg-indigo-500/20 transition-all"
              >
                <Pencil size={13} />
                Chỉnh sửa
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/18 transition-all"
              >
                <Trash2 size={13} />
                Xoá
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left — Gallery */}
        <div className="lg:col-span-2 space-y-3">
          {/* Main image */}
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-white/4 border border-white/8">
            {activeImage ? (
              <Image
                src={activeImage}
                alt={product.name}
                fill
                className="object-contain"
                sizes="(max-width: 1024px) 100vw, 40vw"
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Package size={48} className="text-white/10" />
              </div>
            )}
            {images[activeIdx]?.isPrimary && images.length > 1 && (
              <div className="absolute top-3 left-3 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/25 border border-indigo-500/40 text-indigo-300">
                Ảnh chính
              </div>
            )}
            {images.length > 1 && (
              <div className="absolute bottom-3 right-3 text-[11px] bg-black/60 backdrop-blur-sm text-white/70 px-2 py-0.5 rounded-full">
                {activeIdx + 1} / {images.length}
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={() => setActiveIdx(idx)}
                  className={cn(
                    'flex-shrink-0 relative w-14 h-14 rounded-xl overflow-hidden border-2 transition-all',
                    idx === activeIdx
                      ? 'border-indigo-400/80'
                      : 'border-white/10 opacity-50 hover:opacity-80'
                  )}
                >
                  <Image src={img.url} alt="" fill className="object-cover" sizes="56px" unoptimized />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right — Info or Edit Form */}
        <div className="lg:col-span-3 space-y-5">
          {editing ? (
            /* ── Edit form ── */
            <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-2xl p-5 space-y-4">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <Pencil size={13} className="text-indigo-400" />
                Chỉnh sửa thông tin
              </h3>

              <div>
                <label className="text-white/55 text-xs mb-1.5 block">Tên sản phẩm *</label>
                <input {...register('name')} className="input-glass w-full text-sm" placeholder="Tên sản phẩm" />
                {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="text-white/55 text-xs mb-1.5 block">Mô tả</label>
                <textarea {...register('description')} className="input-glass w-full resize-none text-sm" rows={3} placeholder="Mô tả sản phẩm..." />
              </div>

              <div>
                <label className="text-white/55 text-xs mb-1.5 block">Giá gốc *</label>
                <input {...register('originalPrice', { valueAsNumber: true })} type="number" className="input-glass w-full text-sm" min={0} />
                {priceValue != null && !isNaN(priceValue) && priceValue > 0 && (
                  <p className="text-indigo-400/70 text-xs mt-1">{formatCurrency(priceValue)}</p>
                )}
                {errors.originalPrice && <p className="text-red-400 text-xs mt-1">{errors.originalPrice.message}</p>}
              </div>

              <ImageUploadZone
                existingImages={existingImages}
                pendingImages={pendingImages}
                onAddFiles={handleAddFiles}
                onRemovePending={handleRemovePending}
                onRemoveExisting={handleRemoveExisting}
                removingId={removingImageId}
              />

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={updating}
                  className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  {updating ? (
                    <><Loader2 size={13} className="animate-spin" />{pendingImages.length > 0 ? 'Đang tải ảnh...' : 'Đang lưu...'}</>
                  ) : (
                    <><Check size={13} />Lưu thay đổi</>
                  )}
                </button>
                <button type="button" onClick={cancelEdit} className="btn-glass text-sm px-4 py-2">
                  Huỷ
                </button>
              </div>
            </form>
          ) : (
            /* ── View mode ── */
            <>
              <div className="glass rounded-2xl p-5 space-y-4">
                <h1 className="text-white text-lg font-bold leading-snug">{product.name}</h1>
                {product.description && (
                  <p className="text-white/50 text-sm leading-relaxed">{product.description}</p>
                )}

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-white/4 rounded-xl p-3.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Tag size={11} className="text-indigo-400" />
                      <span className="text-white/40 text-xs">Giá gốc</span>
                    </div>
                    <p className="text-white font-bold">{formatCurrency(product.originalPrice)}</p>
                  </div>
                  <div className="bg-white/4 rounded-xl p-3.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Boxes size={11} className="text-violet-400" />
                      <span className="text-white/40 text-xs">Tồn kho</span>
                    </div>
                    <p className="text-white font-bold">{product.inventory.toLocaleString()}</p>
                  </div>
                </div>

                {images.length > 0 && (
                  <div className="flex items-center gap-1.5 text-white/30 text-xs pt-1 border-t border-white/6">
                    <ImageIcon size={11} />
                    <span>{images.length} hình ảnh</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Campaigns section */}
          <div className="glass rounded-2xl p-5">
            <h3 className="text-white/70 text-sm font-semibold flex items-center gap-2 mb-4">
              <Zap size={13} className="text-indigo-400" />
              Chiến dịch Flash Sale
              {product.campaigns.length > 0 && (
                <span className="ml-auto text-white/30 text-xs font-normal">{product.campaigns.length} chiến dịch</span>
              )}
            </h3>

            {product.campaigns.length === 0 ? (
              <div className="text-center py-6">
                <Zap className="mx-auto mb-2 text-white/15" size={24} />
                <p className="text-white/35 text-xs">Sản phẩm chưa tham gia chiến dịch nào</p>
                <Link
                  href="/merchant/campaigns/create"
                  className="inline-flex items-center gap-1.5 mt-3 text-indigo-400 text-xs hover:text-indigo-300 transition-colors"
                >
                  Tạo chiến dịch <ChevronRight size={11} />
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {product.campaigns.map(c => (
                  <Link
                    key={c.id}
                    href={`/merchant/campaigns/${c.id}/dashboard`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                      <Zap size={13} className="text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium truncate group-hover:text-indigo-300 transition-colors">{c.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Calendar size={9} className="text-white/30" />
                        <span className="text-white/30 text-[10px]">
                          {new Date(c.startTime).toLocaleDateString('vi-VN')}
                        </span>
                        <span className="text-indigo-300/70 text-[10px] font-medium">
                          {formatCurrency(c.salePrice)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                        CAMPAIGN_STATUS_COLOR[c.status]
                      )}>
                        {CAMPAIGN_STATUS_LABEL[c.status]}
                      </span>
                      <ExternalLink size={11} className="text-white/20 group-hover:text-white/50 transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmDelete}
        title="Xoá sản phẩm?"
        description={`Sản phẩm "${product.name}" sẽ bị xoá vĩnh viễn. Không thể hoàn tác.`}
        confirmLabel="Xoá sản phẩm"
        cancelLabel="Giữ lại"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
