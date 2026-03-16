'use client'

import { useReducer, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle, Package, Plus, Trash2, AlertCircle, Loader2 } from 'lucide-react'
import { useCreateCampaign } from '@/hooks/mutations/useCreateCampaign'
import { useAddCampaignProduct } from '@/hooks/mutations/useAddCampaignProduct'
import { useSubmitCampaign } from '@/hooks/mutations/useSubmitCampaign'
import { useMyProducts } from '@/hooks/queries/useMyProducts'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, calculateDiscount } from '@/lib/utils'
import type { Product } from '@/types'

const step1Schema = z.object({
  name: z.string().min(5, 'Tối thiểu 5 ký tự').max(100),
  description: z.string().max(500).optional(),
  startTime: z.string().refine(
    (v) => new Date(v) > new Date(Date.now() + 3600000),
    'Phải sau hiện tại ít nhất 1 giờ'
  ),
  endTime: z.string(),
}).refine(
  (d) => new Date(d.endTime) > new Date(new Date(d.startTime).getTime() + 1800000),
  { message: 'Phải sau thời gian bắt đầu ít nhất 30 phút', path: ['endTime'] }
)

type Step1Form = z.infer<typeof step1Schema>

interface ProductRow {
  product: Product
  salePrice: number
  saleQuantity: number
  perUserLimit: number
}

interface WizardState {
  step: 1 | 2 | 3
  step1Data: Step1Form | null
  products: ProductRow[]
}

type WizardAction =
  | { type: 'NEXT_STEP1'; data: Step1Form }
  | { type: 'NEXT_STEP2' }
  | { type: 'BACK' }
  | { type: 'ADD_PRODUCT'; product: Product }
  | { type: 'REMOVE_PRODUCT'; productId: string }
  | { type: 'UPDATE_PRODUCT'; productId: string; field: keyof Omit<ProductRow, 'product'>; value: number }

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'NEXT_STEP1': return { ...state, step: 2, step1Data: action.data }
    case 'NEXT_STEP2': return { ...state, step: 3 }
    case 'BACK': return { ...state, step: (state.step - 1) as 1 | 2 | 3 }
    case 'ADD_PRODUCT': return {
      ...state,
      products: [...state.products, {
        product: action.product,
        salePrice: Math.floor(action.product.originalPrice * 0.7),
        saleQuantity: Math.min(10, action.product.inventory),
        perUserLimit: 1,
      }],
    }
    case 'REMOVE_PRODUCT': return { ...state, products: state.products.filter((p) => p.product.id !== action.productId) }
    case 'UPDATE_PRODUCT': return {
      ...state,
      products: state.products.map((p) =>
        p.product.id === action.productId ? { ...p, [action.field]: action.value } : p
      ),
    }
    default: return state
  }
}

const STEPS = ['Thông tin cơ bản', 'Chọn sản phẩm', 'Xem lại & Gửi']

export default function CreateCampaignPage() {
  const router = useRouter()
  const [state, dispatch] = useReducer(reducer, { step: 1, step1Data: null, products: [] })
  const { mutate: createCampaign, loading: creating } = useCreateCampaign()
  const { mutate: addCampaignProduct } = useAddCampaignProduct()
  const { mutate: submitCampaign } = useSubmitCampaign()
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<Step1Form>({
    resolver: zodResolver(step1Schema),
  })

  const handleFinalSubmit = async () => {
    if (!state.step1Data || state.products.length === 0) return
    setSubmitting(true)
    try {
      const campaign = await createCampaign({ ...state.step1Data, description: state.step1Data.description ?? '' })
      await Promise.all(state.products.map((p) =>
        addCampaignProduct(campaign.id, {
          productId: p.product.id,
          salePrice: p.salePrice,
          saleQuantity: p.saleQuantity,
          perUserLimit: p.perUserLimit,
        })
      ))
      await submitCampaign(campaign.id)
      router.push('/merchant/campaigns')
    } catch { /* toast shown */ } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-white text-2xl font-bold">Tạo chiến dịch mới</h1>

      {/* Step indicator */}
      <div className="flex items-center">
        {STEPS.map((label, i) => {
          const stepNum = i + 1
          const isDone = stepNum < state.step
          const isActive = stepNum === state.step
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  isDone ? 'bg-indigo-500/30 border-2 border-indigo-500' : isActive ? 'bg-indigo-600 border-2 border-indigo-400' : 'glass border border-white/20'
                }`}>
                  {isDone ? <CheckCircle size={16} className="text-indigo-300" /> : <span className={isActive ? 'text-white' : 'text-white/40'}>{stepNum}</span>}
                </div>
                <span className={`text-xs text-center hidden md:block ${isActive ? 'text-white' : 'text-white/40'}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${isDone ? 'bg-indigo-500/50' : 'bg-white/10'}`} />}
            </div>
          )
        })}
      </div>

      {/* Step 1 */}
      {state.step === 1 && (
        <form onSubmit={handleSubmit((data) => dispatch({ type: 'NEXT_STEP1', data }))} className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold">Thông tin cơ bản</h2>
          <div>
            <label className="text-white/60 text-sm mb-1 block">Tên chiến dịch *</label>
            <input {...register('name')} className="input-glass" placeholder="Flash Sale Cuối Tuần" />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="text-white/60 text-sm mb-1 block">Mô tả</label>
            <textarea {...register('description')} className="input-glass resize-none" rows={3} placeholder="Mô tả về chiến dịch..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-white/60 text-sm mb-1 block">Thời gian bắt đầu *</label>
              <input {...register('startTime')} type="datetime-local" className="input-glass" />
              {errors.startTime && <p className="text-red-400 text-xs mt-1">{errors.startTime.message}</p>}
            </div>
            <div>
              <label className="text-white/60 text-sm mb-1 block">Thời gian kết thúc *</label>
              <input {...register('endTime')} type="datetime-local" className="input-glass" />
              {errors.endTime && <p className="text-red-400 text-xs mt-1">{errors.endTime.message}</p>}
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary">Tiếp theo →</button>
          </div>
        </form>
      )}

      {/* Step 2 */}
      {state.step === 2 && <Step2 state={state} dispatch={dispatch} />}

      {/* Step 3 */}
      {state.step === 3 && state.step1Data && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-6 space-y-4">
            <h2 className="text-white font-semibold">Xem lại thông tin</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><p className="text-white/40">Tên chiến dịch</p><p className="text-white font-medium">{state.step1Data.name}</p></div>
              <div><p className="text-white/40">Số sản phẩm</p><p className="text-white font-medium">{state.products.length} sản phẩm</p></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10">
                  {['Sản phẩm', 'Giá flash sale', 'Số lượng', 'Giảm'].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-white/40 text-xs">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {state.products.map((row) => (
                    <tr key={row.product.id} className="border-b border-white/5">
                      <td className="py-2 px-3 text-white text-xs">{row.product.name}</td>
                      <td className="py-2 px-3 text-indigo-300 font-bold text-xs">{formatCurrency(row.salePrice)}</td>
                      <td className="py-2 px-3 text-white/70 text-xs">{row.saleQuantity}</td>
                      <td className="py-2 px-3"><span className="bg-orange-500/20 text-orange-300 text-xs px-2 py-0.5 rounded-full">-{calculateDiscount(row.product.originalPrice, row.salePrice)}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="glass rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-yellow-300 text-sm">Chiến dịch cần Admin phê duyệt. Thường trong 24 giờ làm việc.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => dispatch({ type: 'BACK' })} className="btn-glass">← Quay lại</button>
            <button onClick={handleFinalSubmit} disabled={submitting || creating} className="btn-primary disabled:opacity-50">
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang gửi...
                </span>
              ) : 'Gửi phê duyệt'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Step2({ state, dispatch }: { state: WizardState; dispatch: React.Dispatch<WizardAction> }) {
  const { data: products, loading } = useMyProducts()
  const [search, setSearch] = useState('')
  const addedIds = new Set(state.products.map((p) => p.product.id))
  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))

  const canProceed = state.products.length > 0 && state.products.every((row) =>
    row.salePrice > 0 && row.salePrice < row.product.originalPrice && row.saleQuantity > 0
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: My products */}
        <div className="glass rounded-2xl p-4 space-y-3">
          <h3 className="text-white font-semibold text-sm">Sản phẩm của tôi</h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-glass text-sm py-2"
            placeholder="Tìm sản phẩm..."
          />
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass rounded-xl p-3 animate-pulse flex gap-3">
                  <div className="bg-white/8 w-10 h-10 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <div className="bg-white/8 h-3 w-3/4 rounded" />
                    <div className="bg-white/8 h-3 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Package} title="Chưa có sản phẩm" description="" />
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filtered.map((product) => {
                const added = addedIds.has(product.id)
                return (
                  <div key={product.id} className="glass rounded-xl p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex-shrink-0 flex items-center justify-center">
                      <Package size={16} className="text-white/40" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium line-clamp-1">{product.name}</p>
                      <p className="text-white/40 text-xs">{formatCurrency(product.originalPrice)}</p>
                    </div>
                    {added ? (
                      <span className="text-emerald-400 text-xs flex items-center gap-1">
                        <CheckCircle size={12} /> Đã thêm
                      </span>
                    ) : (
                      <button
                        onClick={() => dispatch({ type: 'ADD_PRODUCT', product })}
                        className="text-indigo-400 hover:text-indigo-300 p-1.5 rounded-lg hover:bg-indigo-500/10 transition-all"
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: Added products */}
        <div className="glass rounded-2xl p-4 space-y-3">
          <h3 className="text-white font-semibold text-sm">Sản phẩm trong chiến dịch ({state.products.length})</h3>
          {state.products.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-8">Chọn sản phẩm từ danh sách bên trái</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {state.products.map((row) => {
                const discount = calculateDiscount(row.product.originalPrice, row.salePrice)
                return (
                  <div key={row.product.id} className="glass-brand rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-white text-xs font-medium line-clamp-1">{row.product.name}</p>
                      <button onClick={() => dispatch({ type: 'REMOVE_PRODUCT', productId: row.product.id })} className="text-red-400 hover:text-red-300 p-1 rounded transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-white/40 text-xs">Giá flash sale</label>
                        <input
                          type="number"
                          value={row.salePrice}
                          onChange={(e) => dispatch({ type: 'UPDATE_PRODUCT', productId: row.product.id, field: 'salePrice', value: Number(e.target.value) })}
                          className="input-glass text-xs py-1 mt-0.5"
                          min={1000}
                          max={row.product.originalPrice - 1}
                        />
                      </div>
                      <div>
                        <label className="text-white/40 text-xs">Số lượng</label>
                        <input
                          type="number"
                          value={row.saleQuantity}
                          onChange={(e) => dispatch({ type: 'UPDATE_PRODUCT', productId: row.product.id, field: 'saleQuantity', value: Number(e.target.value) })}
                          className="input-glass text-xs py-1 mt-0.5"
                          min={1}
                          max={row.product.inventory}
                        />
                      </div>
                      <div>
                        <label className="text-white/40 text-xs">Limit/người</label>
                        <input
                          type="number"
                          value={row.perUserLimit}
                          onChange={(e) => dispatch({ type: 'UPDATE_PRODUCT', productId: row.product.id, field: 'perUserLimit', value: Number(e.target.value) })}
                          className="input-glass text-xs py-1 mt-0.5"
                          min={1}
                        />
                      </div>
                    </div>
                    {row.salePrice > 0 && row.salePrice < row.product.originalPrice && (
                      <span className="bg-orange-500/20 text-orange-300 text-xs px-2 py-0.5 rounded-full">Giảm {discount}%</span>
                    )}
                    {row.salePrice >= row.product.originalPrice && (
                      <p className="text-red-400 text-xs">Giá flash sale phải nhỏ hơn giá gốc ({formatCurrency(row.product.originalPrice)})</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <button onClick={() => dispatch({ type: 'BACK' })} className="btn-glass">← Quay lại</button>
        <button onClick={() => dispatch({ type: 'NEXT_STEP2' })} disabled={!canProceed} className="btn-primary disabled:opacity-50">
          Tiếp theo →
        </button>
      </div>
    </div>
  )
}
