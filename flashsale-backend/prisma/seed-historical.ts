/**
 * seed-historical.ts — Dữ liệu lịch sử cho analytics/charts
 *
 * Thêm vào DB (KHÔNG xóa data hiện tại):
 *   • 2 historical merchants (HistoryTech, HistoryHome) + 20 products
 *   • 100 customer accounts (hist-customer-001 → 100)
 *   • 10 campaigns ENDED trải dài 03/03 → 16/04/2026
 *   • Mỗi campaign: 10 CampaignProducts × 20-50 orders đầy đủ
 *   • CampaignAnalyticsSnapshot: snapshot mỗi 5 phút
 *   • FunnelEvent: dữ liệu funnel cho từng campaign
 *
 * Chạy: cd flashsale-backend && pnpm seed:historical
 */

import { Prisma, PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

// ─── Cấu hình ─────────────────────────────────────────────────────────────────
const NUM_CUSTOMERS = 100
const MIN_ORDERS = 20
const MAX_ORDERS = 50
const COMMISSION_RATE = 0.05

// ─── Ảnh placeholder ──────────────────────────────────────────────────────────
const IMG: Record<string, string> = {
  iphone:
    'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&q=80',
  samsung:
    'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=800&q=80',
  macbook:
    'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80',
  ipad: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800&q=80',
  airpods:
    'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&q=80',
  headphone:
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80',
  ps5: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=800&q=80',
  watch:
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80',
  drone:
    'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=800&q=80',
  gopro:
    'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&q=80',
  vacuum:
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
  ricecooker:
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80',
  airfryer:
    'https://images.unsplash.com/photo-1585515320310-259814833e62?w=800&q=80',
  speaker:
    'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80',
  smartlight:
    'https://images.unsplash.com/photo-1558002038-1055907df827?w=800&q=80',
  waterfilter:
    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80',
  robot:
    'https://images.unsplash.com/photo-1584949091598-c31daaaa4aa9?w=800&q=80',
  blender:
    'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=800&q=80',
  coffee:
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80',
  garmin:
    'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800&q=80'
}

// ─── Template sản phẩm ────────────────────────────────────────────────────────
interface ProductTmpl {
  name: string
  desc: string
  price: number // giá gốc (VND)
  sale: number // giá flash sale
  qty: number // saleQuantity
  img: string
}

const TECH_PRODUCTS: ProductTmpl[] = [
  {
    name: 'iPhone 14 Pro 128GB',
    desc: 'Chip A16, Dynamic Island, camera 48MP ProRAW, ProMotion OLED 6.1"',
    price: 29990000,
    sale: 19990000,
    qty: 50,
    img: 'iphone'
  },
  {
    name: 'Samsung Galaxy S23 Ultra',
    desc: 'Snapdragon 8 Gen 2, bút S Pen, camera 200MP, Dynamic AMOLED 6.8"',
    price: 22990000,
    sale: 14990000,
    qty: 40,
    img: 'samsung'
  },
  {
    name: 'MacBook Air M2 13"',
    desc: 'Chip Apple M2, RAM 8GB, SSD 256GB, Liquid Retina 13.6", 18h pin',
    price: 27990000,
    sale: 19990000,
    qty: 30,
    img: 'macbook'
  },
  {
    name: 'iPad Pro M2 11"',
    desc: 'Chip M2, USB-C Thunderbolt 4, Wi-Fi 6E, Liquid Retina ProMotion 120Hz',
    price: 20990000,
    sale: 14990000,
    qty: 35,
    img: 'ipad'
  },
  {
    name: 'AirPods Pro 1st Gen',
    desc: 'ANC H1, Spatial Audio, IPX4, hộp sạc MagSafe Lightning',
    price: 4490000,
    sale: 2990000,
    qty: 80,
    img: 'airpods'
  },
  {
    name: 'Sony WH-1000XM4',
    desc: 'ANC hàng đầu, Multipoint, 30h pin, giải thuật HD Noise Cancelling Processor QN1',
    price: 5990000,
    sale: 3990000,
    qty: 60,
    img: 'headphone'
  },
  {
    name: 'PlayStation 5 Digital Edition',
    desc: 'SSD NVMe tốc độ cao, ray tracing, 4K@120fps, DualSense haptic feedback',
    price: 10990000,
    sale: 7990000,
    qty: 25,
    img: 'ps5'
  },
  {
    name: 'Apple Watch Series 7 45mm',
    desc: 'Màn hình lớn hơn 20%, Always-On Retina, ECG, GPS, Crack-resistant',
    price: 7990000,
    sale: 5490000,
    qty: 40,
    img: 'watch'
  },
  {
    name: 'DJI Mini 3 Pro',
    desc: 'Cảm biến 1/1.3", 4K/60fps, Obstacle Sensing 3 chiều, bay 34 phút',
    price: 14990000,
    sale: 9990000,
    qty: 20,
    img: 'drone'
  },
  {
    name: 'GoPro HERO11 Black',
    desc: '5.3K/60fps, HyperSmooth 5.0, Horizon Lock 360°, chống nước 10m',
    price: 8490000,
    sale: 5990000,
    qty: 45,
    img: 'gopro'
  }
]

const HOME_PRODUCTS: ProductTmpl[] = [
  {
    name: 'Dyson V12 Slim+ Absolute',
    desc: 'HEPA, Fluffy Optic head, LCD screen, 45 phút pin, hút 3D truc tiếp trên sàn',
    price: 12490000,
    sale: 8990000,
    qty: 20,
    img: 'vacuum'
  },
  {
    name: 'Zojirushi NL-HAQ10 IH 1L',
    desc: 'IH cao tần, Neuro Fuzzy AI, giữ nóng 24h, nấu ngon như cơm tay',
    price: 4990000,
    sale: 3290000,
    qty: 50,
    img: 'ricecooker'
  },
  {
    name: 'Cosori Pro Air Fryer 5.8L',
    desc: '12 chế độ nấu, 100 công thức, 75-230°C, kết nối VeSync App, rổ không dính',
    price: 2490000,
    sale: 1590000,
    qty: 80,
    img: 'airfryer'
  },
  {
    name: 'JBL Flip 6 Bluetooth Speaker',
    desc: '30W 2-way, IP67, 12h pin, PartyBoost, USB-C sạc nhanh',
    price: 2290000,
    sale: 1590000,
    qty: 90,
    img: 'speaker'
  },
  {
    name: 'Philips Hue White & Color A19',
    desc: '9W E27, 16 triệu màu, Bluetooth + Zigbee, tích hợp Alexa / HomeKit / Google',
    price: 890000,
    sale: 590000,
    qty: 150,
    img: 'smartlight'
  },
  {
    name: 'Kangaroo Hydrogen KG10A3 RO',
    desc: '10 lõi lọc, hydrogen bổ sung, 10L/h, van tự ngắt khi đầy, diệt 99.99% vi khuẩn',
    price: 4990000,
    sale: 3290000,
    qty: 40,
    img: 'waterfilter'
  },
  {
    name: 'Roborock S7 MaxV Ultra',
    desc: 'ReactiveAI 2.0, lau rung siêu âm, LiDAR 3D, tự làm sạch mop, tự đổ rác',
    price: 9990000,
    sale: 6490000,
    qty: 25,
    img: 'robot'
  },
  {
    name: 'BlendJet 2 Portable Blender',
    desc: 'USB-C, 6-blade inox, tự làm sạch, 15 lần xay 1 lần sạc, chứa 800ml',
    price: 1490000,
    sale: 990000,
    qty: 100,
    img: 'blender'
  },
  {
    name: 'Nespresso Vertuo Pop Bundle',
    desc: 'Centrifusion extraction, 5 kích thước cốc, Bluetooth, kèm Aeroccino frother',
    price: 3490000,
    sale: 2290000,
    qty: 60,
    img: 'coffee'
  },
  {
    name: 'Garmin Venu 2 Plus Smartwatch',
    desc: 'AMOLED 1.3", SpO2, ECG, 25 chế độ thể thao, gọi điện từ cổ tay, 9 ngày pin',
    price: 9990000,
    sale: 6490000,
    qty: 30,
    img: 'garmin'
  }
]

// ─── Template campaigns (10 chiến dịch lịch sử) ──────────────────────────────
interface CampaignTmpl {
  name: string
  desc: string
  start: Date // UTC (10:00 ICT = 03:00 UTC)
  end: Date // UTC (22:00 ICT = 15:00 UTC) — campaign dài 12 giờ
  type: 'TECH' | 'HOME'
  catCode: string
  productOrder: number[] // thứ tự chỉ số trong mảng TECH/HOME_PRODUCTS (0-9)
}

const CAMPAIGN_TMPLS: CampaignTmpl[] = [
  {
    name: 'Flash Sale Điện Thoại & Tablet Tháng 3',
    desc: 'Khai xuân công nghệ: iPhone 14 Pro, Samsung S23 Ultra, MacBook Air M2, iPad Pro M2 giảm đến 33%. 12 giờ vàng, số lượng cực giới hạn!',
    start: new Date('2026-03-03T03:00:00Z'),
    end: new Date('2026-03-03T15:00:00Z'),
    type: 'TECH',
    catCode: 'ELECTRONICS',
    productOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  },
  {
    name: 'Flash Sale Âm Thanh & Gaming Tuần 2 Tháng 3',
    desc: 'Thiên đường giải trí: PS5 Digital, Sony XM4, GoPro HERO11, AirPods Pro giảm sock 40%!',
    start: new Date('2026-03-08T03:00:00Z'),
    end: new Date('2026-03-08T15:00:00Z'),
    type: 'TECH',
    catCode: 'ELECTRONICS',
    productOrder: [6, 5, 4, 9, 8, 7, 0, 1, 2, 3]
  },
  {
    name: 'Flash Sale Đồ Gia Dụng Thông Minh Tháng 3',
    desc: 'Smart home upgrade: Dyson V12, Roborock S7 MaxV, Philips Hue, Zojirushi. Giảm 35-40%, giao hàng trong ngày!',
    start: new Date('2026-03-13T03:00:00Z'),
    end: new Date('2026-03-13T15:00:00Z'),
    type: 'HOME',
    catCode: 'HOME_APPLIANCE',
    productOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  },
  {
    name: 'Flash Sale Thứ 6 Tuần 3 - Laptop & Drone',
    desc: 'Công nghệ sáng tạo: MacBook Air M2, DJI Mini 3 Pro, iPad Pro. Gear up cho dự án tiếp theo!',
    start: new Date('2026-03-20T03:00:00Z'),
    end: new Date('2026-03-20T15:00:00Z'),
    type: 'TECH',
    catCode: 'ELECTRONICS',
    productOrder: [2, 3, 8, 9, 0, 1, 4, 5, 6, 7]
  },
  {
    name: 'Flash Sale Smart Home Cuối Tuần Tháng 3',
    desc: 'Tổ ấm hiện đại: máy lọc nước Kangaroo, robot Roborock, máy pha Nespresso, loa JBL. Miễn phí vận chuyển toàn quốc!',
    start: new Date('2026-03-22T03:00:00Z'),
    end: new Date('2026-03-22T15:00:00Z'),
    type: 'HOME',
    catCode: 'HOME_APPLIANCE',
    productOrder: [5, 6, 8, 3, 4, 0, 1, 2, 7, 9]
  },
  {
    name: 'Flash Sale Tổng Kết Tháng 3 - Clearance',
    desc: 'Closing tháng 3: Apple Watch S7, iPhone 14 Pro, Garmin Venu 2, Dyson. Thanh lý tồn kho cuối tháng, giảm đến 45%!',
    start: new Date('2026-03-29T03:00:00Z'),
    end: new Date('2026-03-29T15:00:00Z'),
    type: 'TECH',
    catCode: 'ELECTRONICS',
    productOrder: [7, 0, 4, 5, 1, 6, 2, 3, 8, 9]
  },
  {
    name: 'Flash Sale Mở Màn Tháng 4 - Flagship Phones',
    desc: 'Tháng 4 bắt đầu rực rỡ: iPhone 14 Pro Max, Samsung S23 Ultra, MacBook deal sốc. Chỉ còn 12 giờ!',
    start: new Date('2026-04-03T03:00:00Z'),
    end: new Date('2026-04-03T15:00:00Z'),
    type: 'TECH',
    catCode: 'ELECTRONICS',
    productOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  },
  {
    name: 'Flash Sale Bếp Thông Minh Tháng 4',
    desc: 'Nhà bếp hiện đại: Zojirushi, Cosori Air Fryer, Nespresso, BlendJet. Ăn ngon mỗi ngày, sống khỏe mỗi bữa!',
    start: new Date('2026-04-08T03:00:00Z'),
    end: new Date('2026-04-08T15:00:00Z'),
    type: 'HOME',
    catCode: 'HOME_APPLIANCE',
    productOrder: [1, 2, 8, 7, 4, 5, 6, 3, 0, 9]
  },
  {
    name: 'Flash Sale Công Nghệ Cao Giữa Tháng 4',
    desc: 'Phiêu lưu mùa hè: DJI Mini 3 Pro, GoPro HERO11, PS5, AirPods Pro. Gear up cho kỳ nghỉ hè!',
    start: new Date('2026-04-13T03:00:00Z'),
    end: new Date('2026-04-13T15:00:00Z'),
    type: 'TECH',
    catCode: 'ELECTRONICS',
    productOrder: [8, 9, 6, 4, 5, 7, 0, 1, 2, 3]
  },
  {
    name: 'Flash Sale Tuần Cuối Tháng 4 - Last Chance',
    desc: 'Roborock S7, Garmin Venu 2, JBL Flip 6, Philips Hue: last chance của tháng 4. Đừng bỏ lỡ!',
    start: new Date('2026-04-16T03:00:00Z'),
    end: new Date('2026-04-16T15:00:00Z'),
    type: 'HOME',
    catCode: 'HOME_APPLIANCE',
    productOrder: [6, 9, 3, 4, 5, 0, 1, 2, 7, 8]
  }
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  )
}

const STREETS = [
  'Nguyễn Huệ',
  'Lê Lợi',
  'Trần Hưng Đạo',
  'Đinh Tiên Hoàng',
  'Võ Thị Sáu',
  'Lý Tự Trọng',
  'Cách Mạng Tháng 8',
  'Nam Kỳ Khởi Nghĩa',
  'Phan Đình Phùng',
  'Nguyễn Trãi'
]
const DISTRICTS = [
  'Quận 1',
  'Quận 3',
  'Quận 5',
  'Bình Thạnh',
  'Tân Bình',
  'Phú Nhuận',
  'Gò Vấp',
  'Thủ Đức',
  'Hoàn Kiếm',
  'Đống Đa'
]
const CITIES = [
  'TP.HCM',
  'Hà Nội',
  'Đà Nẵng',
  'Cần Thơ',
  'Hải Phòng',
  'Nha Trang',
  'Vũng Tàu',
  'Huế'
]

function fakeAddr(seed: number): string {
  const n = (seed % 200) + 1
  return `${n} ${STREETS[seed % STREETS.length]}, ${
    DISTRICTS[seed % DISTRICTS.length]
  }, ${CITIES[seed % CITIES.length]}`
}

// ─── Tạo product + inventory + ảnh ───────────────────────────────────────────
async function createProduct(
  merchantId: string,
  tmpl: ProductTmpl,
  idx: number
): Promise<{ id: string } & ProductTmpl> {
  const imgUrl = IMG[tmpl.img] ?? IMG['iphone']
  const feId = `hfe${idx}-${randomUUID().slice(0, 8)}`
  const phId = `hph${idx}-${randomUUID().slice(0, 8)}`

  await prisma.fileEntity.create({
    data: {
      id: feId,
      fileName: `hist-${tmpl.img}-${idx}.jpg`,
      url: imgUrl,
      mimeType: 'image/jpeg',
      size: 204800,
      description: `Ảnh sản phẩm lịch sử: ${tmpl.name}`,
      Photo: { create: { id: phId, url: imgUrl } }
    }
  })

  const p = await prisma.product.create({
    data: {
      merchantId,
      name: tmpl.name,
      description: tmpl.desc,
      originalPrice: tmpl.price,
      status: 'ACTIVE',
      inventory: { create: { quantity: tmpl.qty * 6, reserved: 0 } },
      images: { create: { photoId: phId, isPrimary: true, sortOrder: 0 } }
    }
  })
  return { id: p.id, ...tmpl }
}

// ─── Tạo analytics snapshots mỗi 5 phút cho một campaign ─────────────────────
async function createSnapshots(
  campaignId: string,
  cps: Array<{ id: string; qty: number; saleQty: number }>,
  start: Date,
  end: Date,
  orderTimesByCp: Map<string, Date[]>
): Promise<void> {
  const intervalMs = 5 * 60 * 1000
  const snapshots: Parameters<
    typeof prisma.campaignAnalyticsSnapshot.createMany
  >[0]['data'] = []

  for (const cp of cps) {
    const orderTimes = orderTimesByCp.get(cp.id) ?? []
    let sold = 0
    let revenue = 0

    let cursor = new Date(start)
    while (cursor <= end) {
      // Đếm số orders xảy ra trước thời điểm cursor
      const salesByNow = orderTimes.filter(t => t <= cursor).length
      const newSales = salesByNow - sold
      sold = salesByNow
      revenue = sold * cp.qty * 1000 // tạm dùng unit price đơn giản

      const stockRemaining = Math.max(0, cp.saleQty - sold)
      const stockRatio = stockRemaining / cp.saleQty
      const viewCount = randInt(sold * 5, sold * 10 + 10)
      const purchasesLast5m = newSales

      snapshots.push({
        id: randomUUID(),
        campaignId,
        campaignProductId: cp.id,
        snapshotAt: new Date(cursor),
        stockRemaining,
        stockTotal: cp.saleQty,
        stockRatio,
        purchaseCount: sold,
        revenue,
        conversionRate: viewCount > 0 ? sold / viewCount : 0,
        viewCount,
        clickCount: randInt(
          Math.floor(viewCount * 0.4),
          Math.floor(viewCount * 0.7)
        ),
        attemptCount: randInt(sold, Math.floor(sold * 1.3) + 1),
        purchasesLast5m,
        revenueVelocity: purchasesLast5m * cp.qty * 200
      })

      cursor = new Date(cursor.getTime() + intervalMs)
    }
  }

  // Batch insert theo chunks 500 để tránh query quá lớn
  for (let i = 0; i < snapshots.length; i += 500) {
    await prisma.campaignAnalyticsSnapshot.createMany({
      data: snapshots.slice(i, i + 500)
    })
  }
}

// ─── Tạo funnel events cho một campaign ──────────────────────────────────────
async function createFunnelEvents(
  campaignId: string,
  totalPaidOrders: number,
  start: Date,
  end: Date
): Promise<void> {
  const funnelData: Parameters<
    typeof prisma.funnelEvent.createMany
  >[0]['data'] = []

  // Tỷ lệ funnel: view > click > attempt > checkout > initiated > success
  const views = Math.floor(totalPaidOrders * randInt(8, 12))
  const clicks = Math.floor(views * 0.45)
  const attempts = Math.floor(clicks * 0.55)
  const checkouts = Math.floor(attempts * 0.85)
  const initiated = Math.floor(checkouts * 0.9)
  const successes = totalPaidOrders

  const steps: Array<{
    step:
      | 'CAMPAIGN_VIEW'
      | 'PRODUCT_CLICK'
      | 'PURCHASE_ATTEMPT'
      | 'CHECKOUT_OPEN'
      | 'PAYMENT_INITIATED'
      | 'PAYMENT_SUCCESS'
    count: number
  }> = [
    { step: 'CAMPAIGN_VIEW', count: views },
    { step: 'PRODUCT_CLICK', count: clicks },
    { step: 'PURCHASE_ATTEMPT', count: attempts },
    { step: 'CHECKOUT_OPEN', count: checkouts },
    { step: 'PAYMENT_INITIATED', count: initiated },
    { step: 'PAYMENT_SUCCESS', count: successes }
  ]

  for (const { step, count } of steps) {
    for (let i = 0; i < count; i++) {
      funnelData.push({
        id: randomUUID(),
        sessionId: `sess-hist-${randomUUID().slice(0, 12)}`,
        campaignId,
        step,
        createdAt: randDate(start, end)
      })
    }
  }

  for (let i = 0; i < funnelData.length; i += 1000) {
    await prisma.funnelEvent.createMany({ data: funnelData.slice(i, i + 1000) })
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🌱 Seed dữ liệu lịch sử bắt đầu...\n')
  const t0 = Date.now()

  // 1. Upsert commission categories (idempotent)
  const [catElec, catHome] = await Promise.all([
    prisma.commissionCategory.upsert({
      where: { code: 'ELECTRONICS' },
      update: {},
      create: {
        code: 'ELECTRONICS',
        name: 'Điện tử - Công nghệ',
        defaultRate: 0.05,
        isActive: true,
        sortOrder: 1
      }
    }),
    prisma.commissionCategory.upsert({
      where: { code: 'HOME_APPLIANCE' },
      update: {},
      create: {
        code: 'HOME_APPLIANCE',
        name: 'Đồ gia dụng',
        defaultRate: 0.06,
        isActive: true,
        sortOrder: 3
      }
    })
  ])
  console.log('✅ Commission categories ready')

  // 2. Lấy admin ID để set approvedBy
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true }
  })
  const adminId = admin?.id ?? null

  // 3. Tạo 2 historical merchants
  const pw = await bcrypt.hash('Test@123456', 10)

  const techMerchUser = await prisma.user.create({
    data: {
      email: 'hist-tech@historytech.vn',
      fullName: 'Lịch Sử Công Nghệ',
      passwordHash: pw,
      role: 'MERCHANT',
      emailVerified: true,
      status: 'ACTIVE'
    }
  })
  const techMerch = await prisma.merchantProfile.create({
    data: {
      userId: techMerchUser.id,
      businessName: 'HistoryTech Store',
      taxCode: '9901230001',
      description: 'Merchant lịch sử — tech analytics data',
      phone: '0909100001',
      address: '1 Lê Văn Sỹ, Quận 3, TP.HCM',
      kycStatus: 'APPROVED',
      approvedAt: new Date('2026-01-10'),
      approvedBy: adminId
    }
  })

  const homeMerchUser = await prisma.user.create({
    data: {
      email: 'hist-home@historyhome.vn',
      fullName: 'Lịch Sử Gia Dụng',
      passwordHash: pw,
      role: 'MERCHANT',
      emailVerified: true,
      status: 'ACTIVE'
    }
  })
  const homeMerch = await prisma.merchantProfile.create({
    data: {
      userId: homeMerchUser.id,
      businessName: 'HistoryHome Vietnam',
      taxCode: '9901230002',
      description: 'Merchant lịch sử — home analytics data',
      phone: '0909100002',
      address: '2 Nguyễn Văn Cừ, Quận 5, TP.HCM',
      kycStatus: 'APPROVED',
      approvedAt: new Date('2026-01-10'),
      approvedBy: adminId
    }
  })
  console.log('✅ Historical merchants: HistoryTech Store, HistoryHome Vietnam')

  // 4. Tạo 100 historical customers (batch 10)
  process.stdout.write(`🔧 Tạo ${NUM_CUSTOMERS} customers...`)
  const customers: { id: string }[] = []
  for (let b = 0; b < NUM_CUSTOMERS / 10; b++) {
    const batch = await Promise.all(
      Array.from({ length: 10 }, (_, j) => {
        const idx = b * 10 + j + 1
        const pad = String(idx).padStart(3, '0')
        return prisma.user.create({
          data: {
            email: `hist-customer-${pad}@test.vn`,
            fullName: `Khách Hàng Lịch Sử ${idx}`,
            passwordHash: pw,
            role: 'CUSTOMER',
            emailVerified: true,
            status: 'ACTIVE',
            customerProfile: {
              create: {
                phone: `090${String(9000000 + idx).slice(1)}`,
                defaultAddress: fakeAddr(idx)
              }
            }
          },
          select: { id: true }
        })
      })
    )
    customers.push(...batch)
    process.stdout.write(` ${Math.min((b + 1) * 10, NUM_CUSTOMERS)}`)
  }
  console.log('\n✅ Customers đã tạo')

  // 5. Tạo 20 products (10 tech + 10 home)
  process.stdout.write('🔧 Tạo 20 products...')
  const techProds = await Promise.all(
    TECH_PRODUCTS.map((t, i) => createProduct(techMerch.id, t, i))
  )
  const homeProds = await Promise.all(
    HOME_PRODUCTS.map((t, i) => createProduct(homeMerch.id, t, i + 10))
  )
  console.log(' ✅ 20 products đã tạo')

  // 6. Tạo 10 campaigns + CampaignProducts + toàn bộ order chain
  let totalOrders = 0
  let totalCPs = 0

  for (let ci = 0; ci < CAMPAIGN_TMPLS.length; ci++) {
    const tmpl = CAMPAIGN_TMPLS[ci]
    const isTech = tmpl.type === 'TECH'
    const merchantId = isTech ? techMerch.id : homeMerch.id
    const products = isTech ? techProds : homeProds
    const commCatId = isTech ? catElec.id : catHome.id

    // Tạo campaign (createdAt = 2 ngày trước khi bắt đầu)
    const campaign = await prisma.campaign.create({
      data: {
        merchantId,
        commissionCategoryId: commCatId,
        name: tmpl.name,
        description: tmpl.desc,
        status: 'ENDED',
        startTime: tmpl.start,
        endTime: tmpl.end,
        commissionRate: COMMISSION_RATE,
        approvedAt: new Date(tmpl.start.getTime() - 86400000 * 2),
        approvedBy: adminId,
        createdAt: new Date(tmpl.start.getTime() - 86400000 * 3)
      }
    })

    // Tạo 10 CampaignProducts
    const cpRows = await Promise.all(
      tmpl.productOrder.map(pi => {
        const p = products[pi]
        return prisma.campaignProduct.create({
          data: {
            campaignId: campaign.id,
            productId: p.id,
            salePrice: p.sale,
            saleQuantity: p.qty,
            remainingQuantity: 0, // đã bán hết sau campaign
            perUserLimit: 2,
            createdAt: new Date(tmpl.start.getTime() - 86400000 * 3)
          }
        })
      })
    )
    totalCPs += cpRows.length

    // ── Sinh toàn bộ order data in-memory rồi batch insert ──────────────────
    const resList: Prisma.ReservationCreateManyInput[] = []
    const saList: Prisma.StockAllocationCreateManyInput[] = []
    const ordList: Prisma.OrderCreateManyInput[] = []
    const oiList: Prisma.OrderItemCreateManyInput[] = []
    const payList: Prisma.PaymentCreateManyInput[] = []
    const clList: Prisma.CommissionLedgerCreateManyInput[] = []

    // Map để tính snapshot: cpId → mảng orderTime
    const orderTimesByCp = new Map<string, Date[]>()

    for (let cpi = 0; cpi < cpRows.length; cpi++) {
      const cp = cpRows[cpi]
      const product = products[tmpl.productOrder[cpi]]
      const numOrders = randInt(MIN_ORDERS, MAX_ORDERS)
      const cpTimes: Date[] = []
      orderTimesByCp.set(cp.id, cpTimes)

      for (let oi = 0; oi < numOrders; oi++) {
        const cust = customers[oi % NUM_CUSTOMERS]
        const orderTime = randDate(tmpl.start, tmpl.end)
        cpTimes.push(orderTime)

        const resId = randomUUID()
        const ordId = randomUUID()
        const payId = randomUUID()
        const qty = 1
        const totalAmt = product.sale * qty
        const commAmt = Math.round(totalAmt * COMMISSION_RATE)
        const netAmt = totalAmt - commAmt
        // ~5% đơn bị hủy để data thực tế hơn
        const cancelled = Math.random() < 0.05

        resList.push({
          id: resId,
          customerId: cust.id,
          campaignProductId: cp.id,
          quantity: qty,
          status: cancelled ? 'CANCELLED' : 'PAID',
          idempotencyKey: `hist:${cust.id}:${cp.id}:${oi}`,
          shippingAddress: fakeAddr(oi + cpi * 100 + ci * 10000),
          expiredAt: new Date(tmpl.start.getTime() + 15 * 60000),
          createdAt: orderTime
        })

        saList.push({
          id: randomUUID(),
          campaignProductId: cp.id,
          reservationId: resId,
          quantity: qty,
          createdAt: orderTime
        })

        if (!cancelled) {
          ordList.push({
            id: ordId,
            customerId: cust.id,
            merchantId,
            reservationId: resId,
            idempotencyKey: `hist-ord:${cust.id}:${cp.id}:${oi}`,
            status: 'DONE',
            totalAmount: totalAmt,
            shippingAddress: fakeAddr(oi + cpi * 100 + ci * 10000),
            createdAt: new Date(orderTime.getTime() + 60000)
          })
          oiList.push({
            id: randomUUID(),
            orderId: ordId,
            productId: product.id,
            quantity: qty,
            unitPrice: product.sale,
            originalPrice: product.price,
            createdAt: new Date(orderTime.getTime() + 60000)
          })
          payList.push({
            id: payId,
            reservationId: resId,
            orderId: ordId,
            amount: totalAmt,
            method: 'STRIPE',
            status: 'SUCCESS',
            transactionId: `hist_${randomUUID()
              .replace(/-/g, '')
              .slice(0, 20)}`,
            idempotencyKey: `hist-pay:${cust.id}:${cp.id}:${oi}`,
            paidAt: new Date(orderTime.getTime() + 120000),
            createdAt: new Date(orderTime.getTime() + 90000)
          })
          clList.push({
            id: randomUUID(),
            orderId: ordId,
            paymentId: payId,
            campaignId: campaign.id,
            merchantId,
            commissionCategoryId: commCatId,
            commissionRate: COMMISSION_RATE,
            grossAmount: totalAmt,
            commissionAmount: commAmt,
            netAmount: netAmt,
            createdAt: new Date(orderTime.getTime() + 120000)
          })
        }
      }
      totalOrders += numOrders
    }

    // Batch insert theo đúng thứ tự FK
    await prisma.reservation.createMany({ data: resList, skipDuplicates: true })
    await prisma.stockAllocation.createMany({
      data: saList,
      skipDuplicates: true
    })
    await prisma.order.createMany({ data: ordList, skipDuplicates: true })
    await prisma.orderItem.createMany({ data: oiList, skipDuplicates: true })
    await prisma.payment.createMany({ data: payList, skipDuplicates: true })
    await prisma.commissionLedger.createMany({
      data: clList,
      skipDuplicates: true
    })

    // Analytics snapshots + funnel events
    const cpForSnapshot = cpRows.map((cp, i) => ({
      id: cp.id,
      qty: products[tmpl.productOrder[i]].sale,
      saleQty: products[tmpl.productOrder[i]].qty
    }))
    await createSnapshots(
      campaign.id,
      cpForSnapshot,
      tmpl.start,
      tmpl.end,
      orderTimesByCp
    )
    await createFunnelEvents(campaign.id, ordList.length, tmpl.start, tmpl.end)

    console.log(
      `  ✅ [${ci + 1}/10] "${tmpl.name}" — ${resList.length} reservations, ${
        ordList.length
      } orders`
    )
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log('\n' + '─'.repeat(65))
  console.log('🎉 Seed lịch sử hoàn tất!\n')
  console.log(`  • 2 historical merchants (HistoryTech + HistoryHome)`)
  console.log(`  • ${NUM_CUSTOMERS} historical customer accounts`)
  console.log(`  • 20 products lịch sử (10 tech + 10 home)`)
  console.log(`  • 10 campaigns ENDED (03/03 – 16/04/2026)`)
  console.log(`  • ${totalCPs} CampaignProducts`)
  console.log(
    `  • ~${totalOrders} orders với full chain (reservation→order→payment→commission)`
  )
  console.log(`  • Analytics snapshots (mỗi 5 phút) + funnel events`)
  console.log(`  • Thời gian thực thi: ${elapsed}s`)
  console.log('─'.repeat(65))
  console.log('\n💡 Chạy thêm pnpm seed:load-test để test tải hệ thống')
}

main()
  .catch(e => {
    console.error('❌ Seed thất bại:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
