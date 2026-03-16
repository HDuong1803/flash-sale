'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Package, Plus, Pencil, AlertCircle, Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMyProducts } from '@/hooks/queries/useMyProducts'
import { useCreateProduct } from '@/hooks/mutations/useCreateProduct'
import { useUpdateProduct } from '@/hooks/mutations/useUpdateProduct'
import { useToggleProductStatus } from '@/hooks/mutations/useToggleProductStatus'
import { EmptyState } from '@/components/shared/EmptyState'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'

const schema = z.object({
  name: z.string().min(3, 'Tối thiểu 3 ký tự').max(200),
  description: z.string().max(1000).optional(),
  originalPrice: z.number().min(1000, 'Tối thiểu 1,000 ₫'),
  inventory: z.number().min(0, 'Không được âm'),
  imageUrl: z.string().url('URL không hợp lệ').optional().or(z.literal('')),
})

type ProductForm = z.infer<typeof schema>

export default function MerchantProductsPage() {
  const { data: products, loading, error, refetch } = useMyProducts()
  const { mutate: createProduct, loading: creating } = useCreateProduct()
  const { updateProduct, loading: updating } = useUpdateProduct()
  const { mutate: toggleStatus } = useToggleProductStatus()
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<ProductForm>({
    resolver: zodResolver(schema),
  })
  const imageUrl = watch('imageUrl', '')
  const priceValue = watch('originalPrice')

  const openCreate = () => { setEditProduct(null); reset({}); setSheetOpen(true) }
  const openEdit = (p: Product) => {
    setEditProduct(p)
    reset({ name: p.name, description: p.description, originalPrice: p.originalPrice, inventory: p.inventory, imageUrl: p.imageUrl })
    setSheetOpen(true)
  }

  const onSubmit = async (data: ProductForm) => {
    try {
      const payload = {
        name: data.name,
        description: data.description ?? '',
        originalPrice: data.originalPrice,
        inventory: data.inventory,
      }
      if (editProduct) {
        await updateProduct(editProduct.id, payload)
      } else {
        await createProduct(payload)
      }
      setSheetOpen(false)
      refetch()
    } catch { /* toast shown */ }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-white text-2xl font-bold">Sản phẩm</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Thêm sản phẩm
        </button>
      </div>

      {loading ? (
        <div className="glass rounded-2xl overflow-hidden animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-white/5">
              <div className="bg-white/8 w-10 h-10 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <div className="bg-white/8 h-4 w-1/3 rounded" />
                <div className="bg-white/8 h-3 w-1/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <button onClick={refetch} className="btn-glass text-sm px-4 py-2">Thử lại</button>
        </div>
      ) : products.length === 0 ? (
        <EmptyState icon={Package} title="Chưa có sản phẩm nào" description="Thêm sản phẩm đầu tiên để bắt đầu tạo Flash Sale" action={{ label: 'Thêm sản phẩm đầu tiên', onClick: openCreate }} />
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {['Ảnh', 'Tên', 'Giá gốc', 'Tồn kho', 'Trạng thái', 'Hành động'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-white/40 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden glass relative">
                        {product.imageUrl ? (
                          <Image src={product.imageUrl} alt={product.name} fill className="object-cover" sizes="40px" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Package size={16} className="text-white/20" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white text-sm font-medium">{product.name}</p>
                      {product.description && <p className="text-white/40 text-xs line-clamp-1">{product.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-white/70 text-sm">{formatCurrency(product.originalPrice)}</td>
                    <td className="px-4 py-3 text-white/70 text-sm">{product.inventory.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={product.status === 'ACTIVE'}
                        onCheckedChange={() => toggleStatus(product.id).then(() => refetch())}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(product)} className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="glass-strong border-white/15 bg-transparent">
          <SheetHeader>
            <SheetTitle className="text-white">{editProduct ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm'}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4 px-4 pb-6">
            <div>
              <label className="text-white/60 text-sm mb-1 block">Tên sản phẩm *</label>
              <input {...register('name')} className="input-glass" placeholder="Tên sản phẩm" />
              {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="text-white/60 text-sm mb-1 block">Mô tả</label>
              <textarea {...register('description')} className="input-glass resize-none" rows={3} />
            </div>
            <div>
              <label className="text-white/60 text-sm mb-1 block">Giá gốc *</label>
              <input {...register('originalPrice')} type="number" className="input-glass" placeholder="150000" />
              {priceValue != null && priceValue > 0 && <p className="text-white/40 text-xs mt-1">{formatCurrency(priceValue)}</p>}
              {errors.originalPrice && <p className="text-red-400 text-xs mt-1">{errors.originalPrice.message}</p>}
            </div>
            <div>
              <label className="text-white/60 text-sm mb-1 block">Tồn kho *</label>
              <input {...register('inventory')} type="number" className="input-glass" placeholder="100" />
              {errors.inventory && <p className="text-red-400 text-xs mt-1">{errors.inventory.message}</p>}
            </div>
            <div>
              <label className="text-white/60 text-sm mb-1 block">URL hình ảnh</label>
              <input {...register('imageUrl')} className="input-glass" placeholder="https://..." />
              {imageUrl && imageUrl.startsWith('http') && (
                <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden glass relative">
                  <Image src={imageUrl} alt="preview" fill className="object-cover" sizes="80px" onError={() => {}} />
                </div>
              )}
              {errors.imageUrl && <p className="text-red-400 text-xs mt-1">{errors.imageUrl.message}</p>}
            </div>
            <button type="submit" disabled={creating || updating} className="btn-primary w-full disabled:opacity-50">
              {(creating || updating) ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang lưu...
                </span>
              ) : (editProduct ? 'Lưu thay đổi' : 'Thêm sản phẩm')}
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
