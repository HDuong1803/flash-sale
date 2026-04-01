'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { AlertCircle, Wallet, TrendingUp, Percent, Layers } from 'lucide-react'
import { GlassCard } from '@/components/shared/GlassCard'
import { AutoRefreshTimer } from '@/components/shared/AutoRefreshTimer'
import { formatCurrency } from '@/lib/utils'
import { useFinanceSummary } from '@/hooks/queries/useFinanceSummary'
import { useFinanceTrend } from '@/hooks/queries/useFinanceTrend'
import { useFinanceByCategory } from '@/hooks/queries/useFinanceByCategory'

export default function AdminPaymentsPage() {
  const summaryQuery = useFinanceSummary()
  const trendQuery = useFinanceTrend()
  const categoryQuery = useFinanceByCategory()
  const loading = summaryQuery.loading || trendQuery.loading || categoryQuery.loading
  const error = summaryQuery.error || trendQuery.error || categoryQuery.error

  const summary = summaryQuery.data
  const trend = trendQuery.data
  const categories = categoryQuery.data

  const refetchAll = () => {
    summaryQuery.refetch()
    trendQuery.refetch()
    categoryQuery.refetch()
  }

  const pieData = categories.map((item) => ({
    name: item.name,
    value: item.commissionRevenue,
  }))
  const pieColors = ['#818cf8', '#22d3ee', '#34d399', '#f59e0b', '#f43f5e', '#a78bfa']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard Tài chính Hoa hồng</h1>
        <AutoRefreshTimer onRefresh={refetchAll} />
      </div>

      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      )}
      {error && (
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm">{error}</p>
        </div>
      )}
      {!loading && !error && summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <GlassCard className="p-4">
              <p className="text-white/50 text-xs uppercase">Doanh thu gộp</p>
              <p className="text-white text-xl font-bold mt-2">{formatCurrency(summary.grossRevenue)}</p>
              <Wallet className="text-white/30 mt-2" size={18} />
            </GlassCard>
            <GlassCard className="p-4">
              <p className="text-white/50 text-xs uppercase">Hoa hồng admin</p>
              <p className="text-emerald-400 text-xl font-bold mt-2">{formatCurrency(summary.commissionRevenue)}</p>
              <TrendingUp className="text-emerald-400/50 mt-2" size={18} />
            </GlassCard>
            <GlassCard className="p-4">
              <p className="text-white/50 text-xs uppercase">Tiền ròng merchant</p>
              <p className="text-indigo-300 text-xl font-bold mt-2">{formatCurrency(summary.merchantNetRevenue)}</p>
              <Layers className="text-indigo-300/50 mt-2" size={18} />
            </GlassCard>
            <GlassCard className="p-4">
              <p className="text-white/50 text-xs uppercase">Hoa hồng TB</p>
              <p className="text-yellow-300 text-xl font-bold mt-2">{summary.averageCommissionRatePct.toFixed(2)}%</p>
              <Percent className="text-yellow-300/50 mt-2" size={18} />
            </GlassCard>
            <GlassCard className="p-4">
              <p className="text-white/50 text-xs uppercase">Đơn ghi nhận</p>
              <p className="text-white text-xl font-bold mt-2">{summary.totalCommissionOrders}</p>
              <Layers className="text-white/30 mt-2" size={18} />
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <GlassCard className="p-4">
              <h2 className="text-white font-semibold mb-3">Xu hướng hoa hồng 7 ngày</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend}>
                    <XAxis dataKey="date" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" tickFormatter={(v) => `${Math.round(v / 1000000)}M`} />
                    <Tooltip
                      contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12 }}
                      formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Hoa hồng']}
                    />
                    <Bar dataKey="commissionRevenue" fill="#34d399" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <h2 className="text-white font-semibold mb-3">Cơ cấu hoa hồng theo ngành hàng</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={110} label>
                      {pieData.map((_, idx) => (
                        <Cell key={idx} fill={pieColors[idx % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12 }}
                      formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Hoa hồng']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </div>

          <GlassCard className="p-4 overflow-x-auto">
            <h2 className="text-white font-semibold mb-3">Chi tiết theo danh mục</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/50">
                  <th className="text-left py-2 px-3">Danh mục</th>
                  <th className="text-right py-2 px-3">Rate mặc định</th>
                  <th className="text-right py-2 px-3">Đơn hàng</th>
                  <th className="text-right py-2 px-3">Doanh thu gộp</th>
                  <th className="text-right py-2 px-3">Hoa hồng</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((item) => (
                  <tr key={item.categoryId} className="border-b border-white/5">
                    <td className="py-2 px-3 text-white">{item.name}</td>
                    <td className="py-2 px-3 text-right text-white/80">{(item.defaultRate * 100).toFixed(2)}%</td>
                    <td className="py-2 px-3 text-right text-white/80">{item.orders}</td>
                    <td className="py-2 px-3 text-right text-white/80">{formatCurrency(item.grossRevenue)}</td>
                    <td className="py-2 px-3 text-right text-emerald-300 font-semibold">{formatCurrency(item.commissionRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        </>
      )}
    </div>
  )
}
