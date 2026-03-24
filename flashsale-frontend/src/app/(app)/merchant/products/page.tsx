'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Package,
  Plus,
  Pencil,
  AlertCircle,
  Loader2,
  X,
  Upload,
  ImageIcon,
  Search,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMyProducts } from '@/hooks/queries/useMyProducts'
import { useCreateProduct } from '@/hooks/mutations/useCreateProduct'
import { useUpdateProduct } from '@/hooks/mutations/useUpdateProduct'
import { useDeleteProductImage } from '@/hooks/mutations/useDeleteProductImage'
import { useToggleProductStatus } from '@/hooks/mutations/useToggleProductStatus'
import { EmptyState } from '@/components/shared/EmptyState'
import { Switch } from '@/components/ui/switch'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Product, ProductImage } from '@/types'

const MAX_IMAGES = 10
const MAX_FILE_SIZE_MB = 5
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const schema = z.object({
  name: z.string().min(3, 'Tối thiểu 3 ký tự').max(200),
  description: z.string().max(1000).optional(),
  originalPrice: z.number().min(1000, 'Tối thiểu 1,000 ₫'),
  inventory: z.number().min(0, 'Không được âm')
})

type ProductForm = z.infer<typeof schema>
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

interface PendingImage {
  key: string
  file: File
  previewUrl: string
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
  removingId
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    processFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-white/60 text-sm">Hình ảnh sản phẩm</label>
        <span className="text-white/30 text-xs">{totalCount}/{MAX_IMAGES}</span>
      </div>

      {(existingImages.length > 0 || pendingImages.length > 0) && (
        <div className="grid grid-cols-5 gap-1.5">
          {existingImages.map(img => (
            <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden bg-white/5 border border-white/8">
              <Image src={img.url} alt="" fill className="object-cover" sizes="64px" unoptimized />
              {img.isPrimary && (
                <div className="absolute bottom-0 inset-x-0 bg-indigo-500/80 text-white text-[8px] font-semibold text-center py-0.5">
                  Chính
                </div>
              )}
              <button
                type="button"
                onClick={() => onRemoveExisting(img.id)}
                disabled={removingId === img.id}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
              >
                {removingId === img.id ? (
                  <Loader2 size={8} className="animate-spin" />
                ) : (
                  <X size={8} />
                )}
              </button>
            </div>
          ))}

          {pendingImages.map(img => (
            <div key={img.key} className="relative group aspect-square rounded-lg overflow-hidden bg-white/5 border border-indigo-500/30">
              <Image src={img.previewUrl} alt="" fill className="object-cover" sizes="64px" unoptimized />
              <div className="absolute inset-0 bg-indigo-900/30 flex items-end justify-center pb-0.5">
                <span className="text-white/60 text-[7px]">Chờ tải</span>
              </div>
              <button
                type="button"
                onClick={() => onRemovePending(img.key)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={8} />
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
            onDrop={handleDrop}
            className={cn(
              'w-full border border-dashed rounded-xl p-5 flex flex-col items-center gap-2 transition-all text-sm',
              dragOver
                ? 'border-indigo-400/60 bg-indigo-500/10 text-indigo-300'
                : 'border-white/12 text-white/35 hover:border-white/25 hover:text-white/55 hover:bg-white/3'
            )}
          >
            <Upload size={16} />
            <span className="text-xs">
              {totalCount === 0 ? 'Kéo thả hoặc nhấn để chọn ảnh' : 'Thêm ảnh'}
            </span>
            <span className="text-white/25 text-[11px]">
              JPG, PNG, WebP · Tối đa {MAX_FILE_SIZE_MB}MB/ảnh
            </span>
          </button>
        </>
      )}
    </div>
  )
}

// ─── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({ product, onEdit, onToggleStatus }: { product: Product; onEdit: (p: Product) => void; onToggleStatus: (id: string) => void }) {
  const primaryImage = product.imageUrls?.[0] ?? null
  const imageCount = product.imageUrls?.length ?? 0
  const isActive = product.status === 'ACTIVE'

  return (
    <div className="glass rounded-2xl overflow-hidden group transition-all hover:border-white/15 flex flex-col">
      <Link href={`/merchant/products/${product.id}`} className="relative aspect-[4/3] bg-white/5 overflow-hidden block">
        {primaryImage ? (
          <Image src={primaryImage} alt={product.name} fill className="object-cover group-hover:scale-[1.02] transition-transform duration-300" sizes="(max-width: 768px) 50vw, 33vw" unoptimized />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package size={32} className="text-white/15" />
          </div>
        )}
        {imageCount > 1 && (
          <div className="absolute bottom-2 right-2 flex items-center gap-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full">
            <ImageIcon size={9} />
            <span>{imageCount}</span>
          </div>
        )}
        <div className={cn('absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full', isActive ? 'bg-emerald-500/25 border border-emerald-500/40 text-emerald-300' : 'bg-white/10 border border-white/15 text-white/40')}>
          {isActive ? 'Đang bán' : 'Tạm dừng'}
        </div>
      </Link>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <Link href={`/merchant/products/${product.id}`} className="flex-1 min-h-0">
          <p className="text-white text-sm font-semibold line-clamp-2 leading-snug hover:text-indigo-300 transition-colors">{product.name}</p>
          {product.description && <p className="text-white/35 text-xs mt-1 line-clamp-1 leading-relaxed">{product.description}</p>}
        </Link>

        <div className="flex items-center justify-between pt-1 border-t border-white/6">
          <div>
            <p className="text-indigo-300 text-sm font-bold">{formatCurrency(product.originalPrice)}</p>
            <p className="text-white/35 text-[11px] mt-0.5">Tồn: <span className="text-white/55">{product.inventory.toLocaleString()}</span></p>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch checked={isActive} onCheckedChange={() => onToggleStatus(product.id)} />
            <button onClick={() => onEdit(product)} className="p-1.5 text-white/40 hover:text-indigo-300 hover:bg-indigo-500/12 rounded-lg transition-all" title="Chỉnh sửa">
              <Pencil size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton Card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="glass rounded-2xl overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-white/6" />
      <div className="p-4 space-y-3">
        <div className="space-y-1.5">
          <div className="h-3.5 bg-white/6 rounded w-4/5" />
          <div className="h-3 bg-white/5 rounded w-3/5" />
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <div className="space-y-1">
            <div className="h-4 bg-white/6 rounded w-20" />
            <div className="h-3 bg-white/4 rounded w-14" />
          </div>
          <div className="w-10 h-5 bg-white/6 rounded-full" />
        </div>
      </div>
    </div>
  )
}

// ─── Drawer ────────────────────────────────────────────────────────────────────

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

function Drawer({ open, onClose, title, children }: DrawerProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-[#0f0a2a] border-l border-white/10 shadow-2xl',
          'flex flex-col transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/8 flex-shrink-0">
          <h2 className="text-white font-semibold text-base">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 text-white/40 hover:text-white hover:bg-white/8 rounded-lg transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function MerchantProductsPage() {
  const { data: products, loading, error, refetch } = useMyProducts()
  const { mutate: createProduct, loading: creating } = useCreateProduct()
  const { updateProduct, loading: updating } = useUpdateProduct()
  const { deleteImage, loading: deletingImage } = useDeleteProductImage()
  const { mutate: toggleStatus } = useToggleProductStatus()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)

  const [existingImages, setExistingImages] = useState<ProductImage[]>([])
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [removingImageId, setRemovingImageId] = useState<string | null>(null)

  // Search + filter
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors }
  } = useForm<ProductForm>({ resolver: zodResolver(schema) })

  const priceValue = watch('originalPrice')

  // Filtered products
  const filtered = products.filter(p => {
    const matchSearch = search.trim() === '' || p.name.toLowerCase().includes(search.toLowerCase().trim())
    const matchStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && p.status === 'ACTIVE') ||
      (statusFilter === 'INACTIVE' && p.status !== 'ACTIVE')
    return matchSearch && matchStatus
  })

  const openCreate = () => {
    setEditProduct(null)
    setExistingImages([])
    setPendingImages([])
    reset({ name: '', description: '', originalPrice: undefined, inventory: undefined })
    setDrawerOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditProduct(p)
    setExistingImages(p.images ?? [])
    setPendingImages([])
    reset({
      name: p.name,
      description: p.description,
      originalPrice: p.originalPrice,
      inventory: p.inventory
    })
    setDrawerOpen(true)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setEditProduct(null)
    pendingImages.forEach(img => URL.revokeObjectURL(img.previewUrl))
    setPendingImages([])
    setExistingImages([])
    reset({})
  }

  const handleAddFiles = (files: File[]) => {
    const newPending = files.map(f => ({
      key: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
      file: f,
      previewUrl: URL.createObjectURL(f)
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
    if (!editProduct) return
    setRemovingImageId(imageId)
    try {
      await deleteImage(editProduct.id, imageId)
      setExistingImages(prev => prev.filter(img => img.id !== imageId))
    } catch {
      // toast shown by hook
    } finally {
      setRemovingImageId(null)
    }
  }

  const onSubmit = async (data: ProductForm) => {
    try {
      const files = pendingImages.map(p => p.file)
      if (editProduct) {
        await updateProduct(
          editProduct.id,
          { name: data.name, description: data.description, originalPrice: data.originalPrice },
          files
        )
      } else {
        await createProduct(
          { name: data.name, description: data.description, originalPrice: data.originalPrice, inventory: data.inventory },
          files
        )
      }
      closeDrawer()
      refetch()
    } catch {
      /* toast shown by hook */
    }
  }

  const handleToggleStatus = async (productId: string) => {
    await toggleStatus(productId)
    refetch()
  }

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'ALL', label: 'Tất cả' },
    { value: 'ACTIVE', label: 'Đang bán' },
    { value: 'INACTIVE', label: 'Tạm dừng' }
  ]

  const activeCount = products.filter(p => p.status === 'ACTIVE').length
  const inactiveCount = products.filter(p => p.status !== 'ACTIVE').length

  // Suppress unused variable warning — deletingImage is destructured for correctness
  void deletingImage

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold">Sản phẩm</h1>
          {!loading && products.length > 0 && (
            <p className="text-white/40 text-sm mt-1">
              {products.length} sản phẩm · {activeCount} đang bán · {inactiveCount} tạm dừng
            </p>
          )}
        </div>
        <button
          onClick={openCreate}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={15} />
          Thêm sản phẩm
        </button>
      </div>

      {/* Search + filter bar */}
      {(products.length > 0 || search || statusFilter !== 'ALL') && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Search input */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm kiếm sản phẩm..."
              className="input-glass w-full pl-9 pr-3 py-2 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status pills */}
          <div className="flex items-center gap-1.5 p-1 glass rounded-xl">
            {statusFilters.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  statusFilter === f.value
                    ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/30'
                    : 'text-white/40 hover:text-white/65 hover:bg-white/5'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Filter indicator */}
          {(search || statusFilter !== 'ALL') && (
            <div className="flex items-center gap-1.5 text-white/40 text-xs">
              <SlidersHorizontal size={12} />
              <span>{filtered.length} kết quả</span>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-10 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <button onClick={refetch} className="btn-glass text-sm px-4 py-2">
            Thử lại
          </button>
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Chưa có sản phẩm nào"
          description="Thêm sản phẩm đầu tiên để bắt đầu tạo Flash Sale"
          action={{ label: 'Thêm sản phẩm đầu tiên', onClick: openCreate }}
        />
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <Search className="mx-auto mb-3 text-white/20" size={32} />
          <p className="text-white/50 text-sm">Không tìm thấy sản phẩm phù hợp</p>
          <button
            onClick={() => { setSearch(''); setStatusFilter('ALL') }}
            className="mt-3 text-indigo-400 text-xs hover:text-indigo-300 transition-colors"
          >
            Xoá bộ lọc
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={openEdit}
              onToggleStatus={handleToggleStatus}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editProduct ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="text-white/60 text-sm mb-1.5 block">
              Tên sản phẩm <span className="text-indigo-400">*</span>
            </label>
            <input
              {...register('name')}
              className="input-glass w-full"
              placeholder="Ví dụ: Áo thun cotton unisex"
            />
            {errors.name && (
              <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="text-white/60 text-sm mb-1.5 block">Mô tả</label>
            <textarea
              {...register('description')}
              className="input-glass w-full resize-none"
              rows={3}
              placeholder="Mô tả ngắn về sản phẩm..."
            />
          </div>

          {/* Price + Inventory row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/60 text-sm mb-1.5 block">
                Giá gốc <span className="text-indigo-400">*</span>
              </label>
              <input
                {...register('originalPrice', { valueAsNumber: true })}
                type="number"
                className="input-glass w-full"
                placeholder="150000"
                min={0}
              />
              {priceValue != null && !isNaN(priceValue) && priceValue > 0 && (
                <p className="text-indigo-400/70 text-xs mt-1">{formatCurrency(priceValue)}</p>
              )}
              {errors.originalPrice && (
                <p className="text-red-400 text-xs mt-1">{errors.originalPrice.message}</p>
              )}
            </div>

            <div>
              <label className="text-white/60 text-sm mb-1.5 block">
                Tồn kho {!editProduct && <span className="text-indigo-400">*</span>}
              </label>
              <input
                {...register('inventory', { valueAsNumber: true })}
                type="number"
                className="input-glass w-full"
                placeholder="100"
                min={0}
                disabled={!!editProduct}
              />
              {editProduct && (
                <p className="text-white/25 text-[11px] mt-1">Quản lý qua chiến dịch</p>
              )}
              {errors.inventory && !editProduct && (
                <p className="text-red-400 text-xs mt-1">{errors.inventory.message}</p>
              )}
            </div>
          </div>

          {/* Images */}
          <ImageUploadZone
            existingImages={existingImages}
            pendingImages={pendingImages}
            onAddFiles={handleAddFiles}
            onRemovePending={handleRemovePending}
            onRemoveExisting={handleRemoveExisting}
            removingId={removingImageId}
          />

          {/* Actions — sticky at bottom */}
          <div className="sticky bottom-0 pt-4 pb-2 bg-[#0f0a2a] border-t border-white/8 -mx-6 px-6 mt-6">
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={creating || updating}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {creating || updating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {pendingImages.length > 0 ? 'Đang tải ảnh...' : 'Đang lưu...'}
                  </>
                ) : editProduct ? (
                  <>Lưu thay đổi <ChevronRight size={14} /></>
                ) : (
                  <>Thêm sản phẩm <ChevronRight size={14} /></>
                )}
              </button>
              <button
                type="button"
                onClick={closeDrawer}
                className="btn-glass px-4 py-2.5 text-sm"
              >
                Huỷ
              </button>
            </div>
            {pendingImages.length > 0 && (
              <p className="text-white/35 text-xs text-center mt-2">
                {pendingImages.length} ảnh sẽ được tải lên
              </p>
            )}
          </div>
        </form>
      </Drawer>
    </div>
  )
}
