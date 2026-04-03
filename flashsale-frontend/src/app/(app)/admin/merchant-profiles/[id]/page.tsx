'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  Calendar,
  ClipboardList,
  CreditCard,
  Package,
  Store,
  TrendingUp,
  User
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GlassCard } from '@/components/shared/GlassCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useAdminMerchantOverview } from '@/hooks/queries/useAdminMerchantOverview'
import { formatCurrency, formatDate } from '@/lib/utils'

const RANGE_OPTIONS = [
  { label: '7 ngày', value: 7 },
  { label: '30 ngày', value: 30 },
  { label: '90 ngày', value: 90 },
  { label: '180 ngày', value: 180 }
]

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Nháp',
  APPROVED: 'Chờ duyệt',
  SCHEDULED: 'Đã lên lịch',
  ACTIVE: 'Đang chạy',
  ENDED: 'Đã kết thúc'
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#64748b',
  APPROVED: '#f59e0b',
  SCHEDULED: '#06b6d4',
  ACTIVE: '#10b981',
  ENDED: '#ef4444'
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon
}: {
  label: string
  value: string
  hint: string
  icon: typeof TrendingUp
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-white/50 text-xs uppercase">{label}</p>
        <Icon className="text-indigo-300/70" size={16} />
      </div>
      <p className="text-white text-2xl font-bold mt-2">{value}</p>
      <p className="text-white/40 text-xs mt-1">{hint}</p>
    </GlassCard>
  )
}

export default function AdminMerchantDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const merchantId = useMemo(() => {
    if (!params?.id) return ''
    return Array.isArray(params.id) ? params.id[0] : params.id
  }, [params])

  const [days, setDays] = useState<number>(30)
  const { data, loading, error, refetch } = useAdminMerchantOverview(
    merchantId,
    days,
    !!merchantId
  )

  const campaignStatusChartData = useMemo(() => {
    if (!data) return []
    return Object.entries(data.metrics.campaignsByStatus)
      .map(([status, count]) => ({
        status,
        label: STATUS_LABELS[status] ?? status,
        value: count,
        color: STATUS_COLORS[status] ?? '#a855f7'
      }))
      .filter(item => item.value > 0)
  }, [data])

  const topCampaignRevenueChart = useMemo(() => {
    if (!data) return []
    return [...data.campaigns]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map(item => ({
        name:
          item.name.length > 26 ? `${item.name.slice(0, 26).trim()}...` : item.name,
        revenue: item.revenue
      }))
  }, [data])

  const topProductRevenueChart = useMemo(() => {
    if (!data) return []
    return data.topProducts.slice(0, 8).map(item => ({
      name:
        item.productName.length > 24
          ? `${item.productName.slice(0, 24).trim()}...`
          : item.productName,
      revenue: item.revenue
    }))
  }, [data])

  if (!merchantId) {
    return (
      <GlassCard className="p-8 text-center">
        <p className="text-white/70">Merchant ID không hợp lệ.</p>
      </GlassCard>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-white text-2xl font-bold flex items-center gap-2">
            <Building2 className="text-indigo-300" size={24} />
            {data?.profile.businessName ?? 'Merchant Overview'}
          </h1>
          <p className="text-white/50 text-sm">Merchant key: {merchantId}</p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
            <SelectTrigger className="w-[140px] input-glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-strong border-white/10">
              {RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button onClick={refetch} className="btn-glass text-sm px-3 py-2">
            Làm mới
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              router.back()
              return
            }
            router.push('/admin/merchant-profiles')
          }}
          className="btn-glass text-xs px-3 py-1.5 inline-flex items-center justify-center"
          aria-label="Quay lại"
          title="Quay lại"
        >
          <ArrowLeft size={14} />
        </button>
        <Link href="/admin/merchant-profiles" className="btn-glass text-xs px-3 py-1.5">Hồ sơ merchant</Link>
        <Link href={`/admin/campaigns?search=${encodeURIComponent(merchantId)}`} className="btn-glass text-xs px-3 py-1.5">Campaign của merchant</Link>
        <Link href="/admin/orders" className="btn-glass text-xs px-3 py-1.5">Đơn hàng hệ thống</Link>
        <Link href="/admin/campaign-monitor" className="btn-glass text-xs px-3 py-1.5">Giám sát campaign</Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <GlassCard className="p-8 text-center">
          <p className="text-red-300 text-sm mb-3">{error}</p>
          <button onClick={refetch} className="btn-glass text-sm px-4 py-2">
            Thử lại
          </button>
        </GlassCard>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              label="Doanh thu toàn bộ"
              value={formatCurrency(data.metrics.revenueTotal)}
              hint="Đơn không tính trạng thái hủy"
              icon={TrendingUp}
            />
            <KpiCard
              label={`Doanh thu ${days} ngày`}
              value={formatCurrency(data.metrics.revenueInRange)}
              hint={`${new Date(data.timeframe.since).toLocaleDateString('vi-VN')} - ${new Date(data.timeframe.until).toLocaleDateString('vi-VN')}`}
              icon={CreditCard}
            />
            <KpiCard
              label="Tổng đơn hàng"
              value={data.metrics.ordersTotal.toLocaleString()}
              hint={`DONE ${data.metrics.ordersDone} • CANCEL ${data.metrics.ordersCancelled}`}
              icon={ClipboardList}
            />
            <KpiCard
              label="Tỷ lệ chuyển đổi"
              value={`${data.metrics.conversionRatePct.toFixed(2)}%`}
              hint={`Reservation ${data.metrics.reservationsTotal.toLocaleString()}`}
              icon={TrendingUp}
            />
            <KpiCard
              label="Sản phẩm"
              value={data.metrics.productsTotal.toLocaleString()}
              hint={`Đang active: ${data.metrics.activeProducts.toLocaleString()}`}
              icon={Package}
            />
            <KpiCard
              label="Campaign"
              value={data.metrics.campaignsTotal.toLocaleString()}
              hint={`ACTIVE ${data.metrics.campaignsByStatus.ACTIVE} • ENDED ${data.metrics.campaignsByStatus.ENDED}`}
              icon={Store}
            />
            <KpiCard
              label="Campaign đã xóa"
              value={data.metrics.campaignsDeleted.toLocaleString()}
              hint="Admin có thể xem toàn bộ"
              icon={Store}
            />
            <KpiCard
              label="Campaign merchant ẩn"
              value={data.metrics.campaignsHiddenByMerchant.toLocaleString()}
              hint="Ẩn khỏi danh sách merchant"
              icon={Store}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <GlassCard className="p-5 space-y-3">
              <h2 className="text-white font-semibold">Phân bố trạng thái campaign</h2>
              {campaignStatusChartData.length === 0 ? (
                <p className="text-white/50 text-sm">Chưa có dữ liệu campaign để vẽ biểu đồ.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={campaignStatusChartData}
                        dataKey="value"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={95}
                        label
                      >
                        {campaignStatusChartData.map((entry) => (
                          <Cell key={entry.status} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [
                          Number(value ?? 0).toLocaleString(),
                          String(name)
                        ]}
                        contentStyle={{
                          background: 'rgba(15, 23, 42, 0.95)',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-5 space-y-3">
              <h2 className="text-white font-semibold">Top campaign theo doanh thu</h2>
              {topCampaignRevenueChart.length === 0 ? (
                <p className="text-white/50 text-sm">Chưa có dữ liệu doanh thu campaign.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topCampaignRevenueChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="name" stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={58} />
                      <YAxis stroke="rgba(255,255,255,0.45)" tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}tr`} />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value ?? 0))}
                        contentStyle={{
                          background: 'rgba(15, 23, 42, 0.95)',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}
                      />
                      <Bar dataKey="revenue" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-5 space-y-3">
              <h2 className="text-white font-semibold">Top sản phẩm theo doanh thu</h2>
              {topProductRevenueChart.length === 0 ? (
                <p className="text-white/50 text-sm">Chưa có dữ liệu doanh thu sản phẩm.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProductRevenueChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="name" stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={58} />
                      <YAxis stroke="rgba(255,255,255,0.45)" tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}tr`} />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value ?? 0))}
                        contentStyle={{
                          background: 'rgba(15, 23, 42, 0.95)',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}
                      />
                      <Bar dataKey="revenue" fill="#34d399" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <GlassCard className="p-5 xl:col-span-2 space-y-4">
              <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                <Building2 size={18} className="text-indigo-300" />
                Hồ sơ doanh nghiệp
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Tên doanh nghiệp</p>
                  <p className="text-white">{data.profile.businessName}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Mã số thuế</p>
                  <p className="text-white font-mono">{data.profile.taxCode}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Email kinh doanh</p>
                  <p className="text-white">{data.profile.businessEmail}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Số điện thoại</p>
                  <p className="text-white">{data.profile.businessPhone ?? '—'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-white/50 text-xs uppercase mb-1">Địa chỉ</p>
                  <p className="text-white">{data.profile.businessAddress ?? '—'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-white/50 text-xs uppercase mb-1">Mô tả</p>
                  <p className="text-white/80">{data.profile.description ?? '—'}</p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-5 space-y-4">
              <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                <User size={18} className="text-indigo-300" />
                Người đại diện
              </h2>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Họ tên</p>
                  <p className="text-white">{data.profile.user.fullName}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Email</p>
                  <p className="text-white">{data.profile.user.email}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Trạng thái user</p>
                  <StatusBadge status={data.profile.user.status} />
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Trạng thái KYC</p>
                  <StatusBadge status={data.profile.kycStatus} />
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Đăng nhập gần nhất</p>
                  <p className="text-white/80">{data.profile.user.lastLoginAt ? formatDate(data.profile.user.lastLoginAt) : 'Chưa có dữ liệu'}</p>
                </div>
              </div>
            </GlassCard>
          </div>

          <GlassCard className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold text-lg">Danh sách campaign của merchant</h2>
              <span className="text-white/50 text-xs">Tổng: {data.campaigns.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-3 text-left text-white/50">Campaign</th>
                    <th className="py-2 pr-3 text-left text-white/50">Trạng thái</th>
                    <th className="py-2 pr-3 text-left text-white/50">Sản phẩm</th>
                    <th className="py-2 pr-3 text-left text-white/50">Đơn hàng</th>
                    <th className="py-2 pr-3 text-left text-white/50">Doanh thu</th>
                    <th className="py-2 pr-3 text-left text-white/50">Thời gian</th>
                    <th className="py-2 text-right text-white/50">Điều hướng</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-b border-white/5">
                      <td className="py-3 pr-3">
                        <p className="text-white">{campaign.name}</p>
                        <p className="text-white/40 text-xs">{campaign.id}</p>
                        {campaign.deletedAt && <p className="text-red-300 text-xs">Đã bị admin xóa mềm</p>}
                        {campaign.merchantHiddenAt && <p className="text-yellow-300 text-xs">Merchant đã ẩn</p>}
                      </td>
                      <td className="py-3 pr-3"><StatusBadge status={campaign.status} /></td>
                      <td className="py-3 pr-3 text-white/80">{campaign.productsCount}</td>
                      <td className="py-3 pr-3 text-white/80">{campaign.ordersCount}</td>
                      <td className="py-3 pr-3 text-white/80">{formatCurrency(campaign.revenue)}</td>
                      <td className="py-3 pr-3 text-white/60 text-xs">
                        <p>{formatDate(campaign.startTime)}</p>
                        <p>→ {formatDate(campaign.endTime)}</p>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/admin/campaign-monitor?campaignId=${campaign.id}`} className="btn-glass text-xs px-2 py-1">Monitor</Link>
                          <Link href={`/admin/campaigns/${campaign.id}`} className="btn-glass text-xs px-2 py-1">Quản lý</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <GlassCard className="p-5 space-y-4">
              <h2 className="text-white font-semibold text-lg">Đơn hàng gần nhất</h2>
              <div className="space-y-3">
                {data.recentOrders.length === 0 ? (
                  <p className="text-white/50 text-sm">Chưa có đơn hàng.</p>
                ) : (
                  data.recentOrders.map((order) => (
                    <div key={order.id} className="glass rounded-xl p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-white text-sm font-medium">Đơn {order.id.slice(0, 10)}...</p>
                          <p className="text-white/50 text-xs">Khách: {order.customer.fullName}</p>
                          <p className="text-white/50 text-xs">Campaign: {order.campaign?.name ?? 'N/A'}</p>
                        </div>
                        <div className="text-right">
                          <StatusBadge status={order.status} />
                          <p className="text-white mt-1 text-sm font-semibold">{formatCurrency(order.totalAmount)}</p>
                        </div>
                      </div>
                      <div className="mt-2 text-white/45 text-xs flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(order.createdAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>

            <GlassCard className="p-5 space-y-4">
              <h2 className="text-white font-semibold text-lg">Top sản phẩm theo doanh thu</h2>
              <div className="space-y-2">
                {data.topProducts.length === 0 ? (
                  <p className="text-white/50 text-sm">Chưa có dữ liệu doanh thu sản phẩm.</p>
                ) : (
                  data.topProducts.map((product, index) => (
                    <div key={product.productId} className="glass rounded-xl p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-white text-sm">#{index + 1} {product.productName}</p>
                        <p className="text-white/50 text-xs">SL bán: {product.quantity.toLocaleString()}</p>
                      </div>
                      <p className="text-indigo-300 font-semibold text-sm">{formatCurrency(product.revenue)}</p>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          </div>
        </>
      ) : null}
    </div>
  )
}
