'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Package, Plus, Pencil, AlertCircle, Loader2, X, ChevronDown } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMyProducts } from '@/hooks/queries/useMyProducts'
import { useCreateProduct } from '@/hooks/mutations/useCreateProduct'
import { useUpdateProduct } from '@/hooks/mutations/useUpdateProduct'
import { useToggleProductStatus } from '@/hooks/mutations/useToggleProductStatus'
import { EmptyState } from '@/components/shared/EmptyState'
import { Switch } from '@/components/ui/switch'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
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
  const [formOpen, setFormOpen] = useState(false)

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<ProductForm>({
    resolver: zodResolver(schema),
  })
  const imageUrl = watch('imageUrl', '')
  const priceValue = watch('originalPrice')

  const openCreate = () => {
    setEditProduct(null)
    reset({ name: '', description: '', originalPrice: undefined, inventory: undefined, imageUrl: '' })
    setFormOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditProduct(p)
    reset({ name: p.name, description: p.description, originalPrice: p.originalPrice, inventory: p.inventory, imageUrl: p.imageUrl })
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditProduct(null)
    reset({})
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
      closeForm()
      refetch()
    } catch { /* toast shown by hook */ }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-white text-2xl font-bold">Sản phẩm</h1>
        {!formOpen && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Thêm sản phẩm
          </button>
        )}
      </div>

      {/* Inline form */}
      {formOpen && (
        <div className="glass rounded-2xl overflow-hidden">
          {/* Form header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                {editProduct ? <Pencil size={14} className="text-indigo-400" /> : <Plus size={14} className="text-indigo-400" />}
              </div>
              <h2 className="text-white font-semibold">
                {editProduct ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}
              </h2>
            </div>
            <button onClick={closeForm} className="p-2 text-white/40 hover:text-white hover:bg-white/8 rounded-lg transition-all">
              <X size={16} />
            </button>
          </div>

          {/* Form body */}
          <form onSubmit={handleSubmit(onSubmit)} className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Left column */}
              <div className="space-y-4">
                <div>
                  <label className="text-white/60 text-sm mb-1.5 block">Tên sản phẩm *</label>
                  <input
                    {...register('name')}
                    className="input-glass w-full"
                    placeholder="Ví dụ: Áo thun cotton unisex"
                  />
                  {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
                </div>

                <div>
                  <label className="text-white/60 text-sm mb-1.5 block">Mô tả</label>
                  <textarea
                    {...register('description')}
                    className="input-glass w-full resize-none"
                    rows={4}
                    placeholder="Mô tả ngắn về sản phẩm..."
                  />
                  {errors.description && <p className="text-red-400 text-xs mt-1">{errors.description.message}</p>}
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-4">
                <div>
                  <label className="text-white/60 text-sm mb-1.5 block">Giá gốc *</label>
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
                  {errors.originalPrice && <p className="text-red-400 text-xs mt-1">{errors.originalPrice.message}</p>}
                </div>

                <div>
                  <label className="text-white/60 text-sm mb-1.5 block">Tồn kho *</label>
                  <input
                    {...register('inventory', { valueAsNumber: true })}
                    type="number"
                    className="input-glass w-full"
                    placeholder="100"
                    min={0}
                  />
                  {errors.inventory && <p className="text-red-400 text-xs mt-1">{errors.inventory.message}</p>}
                </div>

                <div>
                  <label className="text-white/60 text-sm mb-1.5 block">URL hình ảnh</label>
                  <input
                    {...register('imageUrl')}
                    className="input-glass w-full"
                    placeholder="https://..."
                  />
                  {errors.imageUrl && <p className="text-red-400 text-xs mt-1">{errors.imageUrl.message}</p>}
                  {imageUrl && imageUrl.startsWith('http') && (
                    <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden glass relative">
                      <Image src={imageUrl} alt="preview" fill className="object-cover" sizes="80px" onError={() => {}} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-6 pt-5 border-t border-white/8">
              <button
                type="submit"
                disabled={creating || updating}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {(creating || updating) ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Đang lưu...</>
                ) : (
                  editProduct ? 'Lưu thay đổi' : 'Thêm sản phẩm'
                )}
              </button>
              <button type="button" onClick={closeForm} className="btn-glass text-sm px-4 py-2">
                Huỷ
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Product list */}
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
      ) : products.length === 0 && !formOpen ? (
        <EmptyState
          icon={Package}
          title="Chưa có sản phẩm nào"
          description="Thêm sản phẩm đầu tiên để bắt đầu tạo Flash Sale"
          action={{ label: 'Thêm sản phẩm đầu tiên', onClick: openCreate }}
        />
      ) : products.length > 0 ? (
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
                  <tr
                    key={product.id}
                    className={cn(
                      'border-b border-white/5 transition-colors',
                      editProduct?.id === product.id
                        ? 'bg-indigo-500/8'
                        : 'hover:bg-white/3',
                    )}
                  >
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
                      <button
                        onClick={() => openEdit(product)}
                        className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add product row at bottom of table */}
          {!formOpen && (
            <button
              onClick={openCreate}
              className="w-full flex items-center gap-3 px-6 py-3.5 text-white/40 hover:text-white/70 hover:bg-white/3 transition-all border-t border-white/5 text-sm"
            >
              <Plus size={15} />
              Thêm sản phẩm
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
