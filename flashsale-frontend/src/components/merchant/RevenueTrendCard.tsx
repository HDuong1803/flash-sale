'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TrendingUp, TrendingDown } from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { useMerchantRevenue } from '@/hooks/queries/useMerchantRevenue'
import { PeriodFilter } from '@/components/shared/PeriodFilter'
import { formatCurrency, formatChartMoney } from '@/lib/utils'

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

export function RevenueTrendCard() {
  const [days, setDays] = useState(7)

  const { start, end } = useMemo(() => ({
    start: toDateStr(new Date(Date.now() - (days - 1) * 86400000)),
    end: toDateStr(new Date()),
  }), [days])

  const { data, loading } = useMerchantRevenue({ startDate: start, endDate: end })

  const chartData = data?.dailyRevenue.map(d => ({
    date: new Date(d.date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh',  day: '2-digit', month: '2-digit' }),
    revenue: d.revenue,
    orders: d.orders,
  })) ?? []

  const summary = data?.summary
  const growth = summary?.growthRate ?? 0
  const isUp = growth >= 0

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div>
          <h2 className="text-white font-semibold">Xu hướng doanh thu</h2>
          <PeriodFilter value={days} onChange={setDays} />
        </div>
        <div className="flex items-center gap-4">
          {summary && (
            <div className="text-right">
              <p className="text-white font-bold text-sm">{formatCurrency(summary.revenueThisPeriod)}</p>
              <p className={`text-xs flex items-center justify-end gap-0.5 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {isUp ? '+' : ''}{growth}% kỳ trước
              </p>
            </div>
          )}
          <Link href="/merchant/revenue" className="text-indigo-400 text-xs hover:text-indigo-300 transition-colors">
            Chi tiết →
          </Link>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="h-44 animate-pulse bg-white/5 rounded-xl" />
        ) : chartData.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-white/30 text-sm">
            Chưa có dữ liệu doanh thu
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={176}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatChartMoney(v)}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15,10,42,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
                formatter={(val: unknown) => [formatCurrency(Number(val)), 'Doanh thu']}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#4f46e5"
                strokeWidth={2}
                fill="url(#revenueAreaGrad)"
                dot={false}
                activeDot={{ r: 4, fill: '#818cf8' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
