import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import * as bcrypt from 'bcrypt'
import { Prisma } from '@prisma/client'
import { DemoRepository } from '../repositories/demo.repository'

// ─── Dữ liệu template sản phẩm ────────────────────────────────────────────────

interface ProductTmpl {
  name: string
  desc: string
  price: number
  sale: number
  qty: number
  imgKey: string
  imgUrl: string
}

const IMG_BASE = 'https://images.unsplash.com/photo-'
const TECH_PRODUCTS: ProductTmpl[] = [
  {
    name: 'iPhone 14 Pro 128GB',
    desc: 'A16 Bionic, Dynamic Island, 48MP ProRAW, OLED ProMotion 6.1"',
    price: 29990000,
    sale: 19990000,
    qty: 50,
    imgKey: 'iphone',
    imgUrl: `${IMG_BASE}1592750475338-74b7b21085ab?w=800&q=80`
  },
  {
    name: 'Samsung Galaxy S23 Ultra',
    desc: 'Snapdragon 8 Gen 2, S Pen, 200MP camera, Dynamic AMOLED 6.8"',
    price: 22990000,
    sale: 14990000,
    qty: 40,
    imgKey: 'samsung',
    imgUrl: `${IMG_BASE}1610945265064-0e34e5519bbf?w=800&q=80`
  },
  {
    name: 'MacBook Air M2 13"',
    desc: 'Apple M2, 8GB RAM, 256GB SSD, Liquid Retina 13.6", 18h battery',
    price: 27990000,
    sale: 19990000,
    qty: 30,
    imgKey: 'macbook',
    imgUrl: `${IMG_BASE}1517336714731-489689fd1ca8?w=800&q=80`
  },
  {
    name: 'iPad Pro M2 11"',
    desc: 'M2 chip, Thunderbolt 4, Wi-Fi 6E, Liquid Retina ProMotion 120Hz',
    price: 20990000,
    sale: 14990000,
    qty: 35,
    imgKey: 'ipad',
    imgUrl: `${IMG_BASE}1544244015-0df4b3ffc6b0?w=800&q=80`
  },
  {
    name: 'AirPods Pro 1st Gen',
    desc: 'ANC H1, Spatial Audio, IPX4, MagSafe charging case',
    price: 4490000,
    sale: 2990000,
    qty: 80,
    imgKey: 'airpods',
    imgUrl: `${IMG_BASE}1600294037681-c80b4cb5b434?w=800&q=80`
  },
  {
    name: 'Sony WH-1000XM4',
    desc: 'Industry-leading ANC, Multipoint, 30h battery, HD Noise Cancelling QN1',
    price: 5990000,
    sale: 3990000,
    qty: 60,
    imgKey: 'headphone',
    imgUrl: `${IMG_BASE}1505740420928-5e560c06d30e?w=800&q=80`
  },
  {
    name: 'PlayStation 5 Digital Edition',
    desc: 'High-speed SSD, ray tracing, 4K@120fps, DualSense haptic feedback',
    price: 10990000,
    sale: 7990000,
    qty: 25,
    imgKey: 'ps5',
    imgUrl: `${IMG_BASE}1606813907291-d86efa9b94db?w=800&q=80`
  },
  {
    name: 'Apple Watch Series 7 45mm',
    desc: 'Always-On Retina, ECG, crack-resistant, GPS, larger display',
    price: 7990000,
    sale: 5490000,
    qty: 40,
    imgKey: 'watch',
    imgUrl: `${IMG_BASE}1523275335684-37898b6baf30?w=800&q=80`
  },
  {
    name: 'DJI Mini 3 Pro',
    desc: '1/1.3" sensor, 4K/60fps, 3-way obstacle sensing, 34min flight time',
    price: 14990000,
    sale: 9990000,
    qty: 20,
    imgKey: 'drone',
    imgUrl: `${IMG_BASE}1473968512647-3e447244af8f?w=800&q=80`
  },
  {
    name: 'GoPro HERO11 Black',
    desc: '5.3K/60fps, HyperSmooth 5.0, Horizon Lock 360°, waterproof 10m',
    price: 8490000,
    sale: 5990000,
    qty: 45,
    imgKey: 'gopro',
    imgUrl: `${IMG_BASE}1526170375885-4d8ecf77b99f?w=800&q=80`
  }
]

const HOME_PRODUCTS: ProductTmpl[] = [
  {
    name: 'Dyson V12 Slim+ Absolute',
    desc: 'HEPA filtration, Fluffy Optic head, LCD screen, 45min battery',
    price: 12490000,
    sale: 8990000,
    qty: 20,
    imgKey: 'vacuum',
    imgUrl: `${IMG_BASE}1558618666-fcd25c85cd64?w=800&q=80`
  },
  {
    name: 'Zojirushi NL-HAQ10 IH 1L',
    desc: 'IH induction, Neuro Fuzzy AI, 24h warm, premium Japanese quality',
    price: 4990000,
    sale: 3290000,
    qty: 50,
    imgKey: 'rice',
    imgUrl: `${IMG_BASE}1556909114-f6e7ad7d3136?w=800&q=80`
  },
  {
    name: 'Cosori Pro Air Fryer 5.8L',
    desc: '12 cook presets, 75-230°C, 100 recipes app, non-stick basket',
    price: 2490000,
    sale: 1590000,
    qty: 80,
    imgKey: 'airfryer',
    imgUrl: `${IMG_BASE}1585515320310-259814833e62?w=800&q=80`
  },
  {
    name: 'JBL Flip 6 Bluetooth Speaker',
    desc: '30W 2-way driver, IP67, 12h battery, PartyBoost link',
    price: 2290000,
    sale: 1590000,
    qty: 90,
    imgKey: 'speaker',
    imgUrl: `${IMG_BASE}1608043152269-423dbba4e7e1?w=800&q=80`
  },
  {
    name: 'Philips Hue White & Color A19',
    desc: '9W E27, 16M colors, Bluetooth + Zigbee, Alexa/HomeKit/Google',
    price: 890000,
    sale: 590000,
    qty: 150,
    imgKey: 'smartlight',
    imgUrl: `${IMG_BASE}1558002038-1055907df827?w=800&q=80`
  },
  {
    name: 'Kangaroo Hydrogen KG10A3 RO',
    desc: '10-stage RO filter, hydrogen-enriched, 10L/h, auto shutoff valve',
    price: 4990000,
    sale: 3290000,
    qty: 40,
    imgKey: 'water',
    imgUrl: `${IMG_BASE}1581578731548-c64695cc6952?w=800&q=80`
  },
  {
    name: 'Roborock S7 MaxV Ultra',
    desc: 'ReactiveAI 2.0, sonic mop vibration, LiDAR 3D, self-cleaning base',
    price: 9990000,
    sale: 6490000,
    qty: 25,
    imgKey: 'robot',
    imgUrl: `${IMG_BASE}1584949091598-c31daaaa4aa9?w=800&q=80`
  },
  {
    name: 'BlendJet 2 Portable Blender',
    desc: 'USB-C, 6-blade stainless steel, self-cleaning, 800ml, 15 blends/charge',
    price: 1490000,
    sale: 990000,
    qty: 100,
    imgKey: 'blender',
    imgUrl: `${IMG_BASE}1570222094114-d054a817e56b?w=800&q=80`
  },
  {
    name: 'Nespresso Vertuo Pop Bundle',
    desc: 'Centrifusion technology, 5 cup sizes, Bluetooth, includes Aeroccino',
    price: 3490000,
    sale: 2290000,
    qty: 60,
    imgKey: 'coffee',
    imgUrl: `${IMG_BASE}1495474472287-4d71bcdd2085?w=800&q=80`
  },
  {
    name: 'Garmin Venu 2 Plus Smartwatch',
    desc: 'AMOLED 1.3", SpO2, ECG, 25 sports modes, phone calls on wrist, 9-day',
    price: 9990000,
    sale: 6490000,
    qty: 30,
    imgKey: 'garmin',
    imgUrl: `${IMG_BASE}1523275335684-37898b6baf30?w=800&q=80`
  }
]

// ─── 10 campaigns lịch sử (03/03 → 16/04/2026) ────────────────────────────────

interface CampaignTmpl {
  name: string
  desc: string
  start: Date
  end: Date
  type: 'TECH' | 'HOME'
  productOrder: number[] // index trong mảng TECH/HOME_PRODUCTS
}

const CAMPAIGN_TMPLS: CampaignTmpl[] = [
  {
    name: 'Flash Sale Điện Thoại & Tablet Tháng 3',
    desc: 'iPhone 14 Pro, Samsung S23 Ultra, MacBook Air M2, iPad Pro giảm đến 33%. 12 giờ vàng!',
    start: new Date('2026-03-03T03:00:00Z'),
    end: new Date('2026-03-03T15:00:00Z'),
    type: 'TECH',
    productOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  },
  {
    name: 'Flash Sale Âm Thanh & Gaming Tuần 2 Tháng 3',
    desc: 'PS5 Digital, Sony XM4, GoPro HERO11, AirPods Pro giảm sốc 40%!',
    start: new Date('2026-03-08T03:00:00Z'),
    end: new Date('2026-03-08T15:00:00Z'),
    type: 'TECH',
    productOrder: [6, 5, 4, 9, 8, 7, 0, 1, 2, 3]
  },
  {
    name: 'Flash Sale Đồ Gia Dụng Thông Minh Tháng 3',
    desc: 'Dyson V12, Roborock S7, Philips Hue, Zojirushi - giảm 35-40%!',
    start: new Date('2026-03-13T03:00:00Z'),
    end: new Date('2026-03-13T15:00:00Z'),
    type: 'HOME',
    productOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  },
  {
    name: 'Flash Sale Laptop & Drone Tháng 3',
    desc: 'MacBook Air M2, DJI Mini 3 Pro, iPad Pro - sáng tạo không giới hạn!',
    start: new Date('2026-03-20T03:00:00Z'),
    end: new Date('2026-03-20T15:00:00Z'),
    type: 'TECH',
    productOrder: [2, 3, 8, 9, 0, 1, 4, 5, 6, 7]
  },
  {
    name: 'Flash Sale Smart Home Cuối Tuần Tháng 3',
    desc: 'Kangaroo RO, Roborock, Nespresso, JBL Flip 6 - nhà thông minh hơn!',
    start: new Date('2026-03-22T03:00:00Z'),
    end: new Date('2026-03-22T15:00:00Z'),
    type: 'HOME',
    productOrder: [5, 6, 8, 3, 4, 0, 1, 2, 7, 9]
  },
  {
    name: 'Flash Sale Tổng Kết Tháng 3 - Clearance',
    desc: 'Apple Watch S7, iPhone 14 Pro, Garmin Venu 2 - closing tháng 3 giảm 45%!',
    start: new Date('2026-03-29T03:00:00Z'),
    end: new Date('2026-03-29T15:00:00Z'),
    type: 'TECH',
    productOrder: [7, 0, 4, 5, 1, 6, 2, 3, 8, 9]
  },
  {
    name: 'Flash Sale Mở Màn Tháng 4 - Flagship Phones',
    desc: 'iPhone 14 Pro, Samsung S23 Ultra, MacBook - tháng 4 bắt đầu rực rỡ!',
    start: new Date('2026-04-03T03:00:00Z'),
    end: new Date('2026-04-03T15:00:00Z'),
    type: 'TECH',
    productOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  },
  {
    name: 'Flash Sale Bếp Thông Minh Tháng 4',
    desc: 'Zojirushi, Cosori Air Fryer, Nespresso, BlendJet - ăn ngon sống khỏe!',
    start: new Date('2026-04-08T03:00:00Z'),
    end: new Date('2026-04-08T15:00:00Z'),
    type: 'HOME',
    productOrder: [1, 2, 8, 7, 4, 5, 6, 3, 0, 9]
  },
  {
    name: 'Flash Sale Công Nghệ Cao Giữa Tháng 4',
    desc: 'DJI Mini 3, GoPro HERO11, PS5, AirPods Pro - gear up cho kỳ nghỉ hè!',
    start: new Date('2026-04-13T03:00:00Z'),
    end: new Date('2026-04-13T15:00:00Z'),
    type: 'TECH',
    productOrder: [8, 9, 6, 4, 5, 7, 0, 1, 2, 3]
  },
  {
    name: 'Flash Sale Tuần Cuối Tháng 4 - Last Chance',
    desc: 'Roborock S7, Garmin Venu 2, JBL Flip 6, Philips Hue - last chance!',
    start: new Date('2026-04-16T03:00:00Z'),
    end: new Date('2026-04-16T15:00:00Z'),
    type: 'HOME',
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
  'Nam Kỳ Khởi Nghĩa'
]
const DISTS = [
  'Quận 1',
  'Quận 3',
  'Bình Thạnh',
  'Tân Bình',
  'Phú Nhuận',
  'Gò Vấp',
  'Hoàn Kiếm'
]
const CITIES = ['TP.HCM', 'Hà Nội', 'Đà Nẵng', 'Cần Thơ', 'Hải Phòng']

function fakeAddr(seed: number): string {
  return `${(seed % 200) + 1} ${STREETS[seed % STREETS.length]}, ${
    DISTS[seed % DISTS.length]
  }, ${CITIES[seed % CITIES.length]}`
}

// ─── DemoSeedService ──────────────────────────────────────────────────────────

/**
 * DemoSeedService — xử lý logic tạo dữ liệu lịch sử
 * Được gọi từ DemoService dưới dạng background task.
 * Cập nhật progress callback sau mỗi bước để client poll được.
 */
@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name)
  private readonly COMMISSION_RATE = 0.05

  constructor(private readonly repo: DemoRepository) {}

  /**
   * runSeed — chạy toàn bộ quá trình seed lịch sử
   * @param opts  - cấu hình số lượng
   * @param onProgress - callback cập nhật progress (0-100) + bước hiện tại
   */
  async runSeed(
    opts: { numCustomers: number; minOrders: number; maxOrders: number },
    onProgress: (progress: number, step: string) => Promise<void>
  ): Promise<Record<string, unknown>> {
    const t0 = Date.now()

    // Bước 1: Commission categories (5%)
    await onProgress(5, 'Khởi tạo commission categories...')
    const { elec, home } = await this.repo.upsertCommissionCategories()
    const adminId = await this.repo.findAdminId()

    // Bước 2: Tạo 2 historical merchants (10%)
    await onProgress(10, 'Tạo 2 historical merchants...')
    const pw = await bcrypt.hash('Test@123456', 10)
    const { techMerch, homeMerch } = await this.createMerchants(pw, adminId)

    // Bước 3: Tạo customers (15%)
    await onProgress(15, `Tạo ${opts.numCustomers} historical customers...`)
    const customers = await this.createCustomers(
      opts.numCustomers,
      pw,
      onProgress
    )

    // Bước 4: Tạo 20 products (35%)
    await onProgress(35, 'Tạo 20 historical products...')
    const techProds = await this.createProducts(techMerch.id, TECH_PRODUCTS)
    const homeProds = await this.createProducts(homeMerch.id, HOME_PRODUCTS)

    // Bước 5-14: Tạo 10 campaigns với order chains (40% → 95%)
    let totalOrders = 0
    for (let ci = 0; ci < CAMPAIGN_TMPLS.length; ci++) {
      const tmpl = CAMPAIGN_TMPLS[ci]
      const progress = 40 + Math.round((ci / CAMPAIGN_TMPLS.length) * 55)
      await onProgress(progress, `Tạo campaign ${ci + 1}/10: "${tmpl.name}"`)

      const isTech = tmpl.type === 'TECH'
      const merchantId = isTech ? techMerch.id : homeMerch.id
      const products = isTech ? techProds : homeProds
      const commCatId = isTech ? elec.id : home.id

      const { ordersCreated } = await this.createCampaignWithOrders({
        tmpl,
        merchantId,
        products,
        commCatId,
        customers,
        adminId,
        minOrders: opts.minOrders,
        maxOrders: opts.maxOrders
      })
      totalOrders += ordersCreated
    }

    // Bước 15: Hoàn thành (100%)
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    await onProgress(100, 'Hoàn tất!')

    return {
      merchants: 2,
      customers: opts.numCustomers,
      products: 20,
      campaigns: 10,
      totalOrders,
      elapsedSeconds: parseFloat(elapsed)
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async createMerchants(pw: string, adminId: string | null) {
    // Kiểm tra nếu đã tồn tại (chạy lại script)
    const existingTech = await this.checkUserExists('hist-tech@historytech.vn')
    const existingHome = await this.checkUserExists('hist-home@historyhome.vn')

    let techMerch: { id: string }
    let homeMerch: { id: string }

    if (existingTech) {
      techMerch = existingTech
    } else {
      techMerch = await this.createOneMerchant({
        email: 'hist-tech@historytech.vn',
        fullName: 'Lịch Sử Công Nghệ',
        businessName: 'HistoryTech Store',
        taxCode: '9901230001',
        phone: '0909100001',
        address: '1 Lê Văn Sỹ, Quận 3, TP.HCM',
        pw,
        adminId
      })
    }

    if (existingHome) {
      homeMerch = existingHome
    } else {
      homeMerch = await this.createOneMerchant({
        email: 'hist-home@historyhome.vn',
        fullName: 'Lịch Sử Gia Dụng',
        businessName: 'HistoryHome Vietnam',
        taxCode: '9901230002',
        phone: '0909100002',
        address: '2 Nguyễn Văn Cừ, Quận 5, TP.HCM',
        pw,
        adminId
      })
    }

    return { techMerch, homeMerch }
  }

  private async checkUserExists(email: string): Promise<{ id: string } | null> {
    // Tìm merchantProfile theo email user
    const user = await this.repo.findUserByEmail(email)
    if (!user) return null
    return this.repo.findMerchantProfileByUserId(user.id)
  }

  private async createOneMerchant(data: {
    email: string
    fullName: string
    businessName: string
    taxCode: string
    phone: string
    address: string
    pw: string
    adminId: string | null
  }): Promise<{ id: string }> {
    // Tạo user MERCHANT → tạo merchantProfile (tuân thủ Controller→Service→Repository)
    const user = await this.repo.createMerchantUser({
      email: data.email,
      fullName: data.fullName,
      passwordHash: data.pw
    })
    return this.repo.createMerchantProfile({
      userId: user.id,
      businessName: data.businessName,
      taxCode: data.taxCode,
      phone: data.phone,
      address: data.address,
      approvedBy: data.adminId
    })
  }

  private async createCustomers(
    count: number,
    pw: string,
    onProgress: (progress: number, step: string) => Promise<void>
  ): Promise<{ id: string }[]> {
    const customers: { id: string }[] = []
    const BATCH = 10
    for (let b = 0; b < count / BATCH; b++) {
      const progress = 15 + Math.round((b / (count / BATCH)) * 20)
      await onProgress(progress, `Tạo customers ${(b + 1) * BATCH}/${count}...`)

      const batch = await Promise.all(
        Array.from({ length: BATCH }, async (_, j) => {
          const idx = b * BATCH + j + 1
          return this.repo.upsertHistCustomer(idx, pw)
        })
      )
      customers.push(...batch)
    }
    return customers
  }

  private async createProducts(
    merchantId: string,
    templates: ProductTmpl[]
  ): Promise<Array<ProductTmpl & { id: string }>> {
    const results: Array<ProductTmpl & { id: string }> = []
    for (let i = 0; i < templates.length; i++) {
      const t = templates[i]
      const feId = `hfe${i}-${randomUUID().slice(0, 8)}`
      const phId = `hph${i}-${randomUUID().slice(0, 8)}`
      const p = await this.repo.createHistProduct({
        merchantId,
        name: t.name,
        description: t.desc,
        originalPrice: t.price,
        imageUrl: t.imgUrl,
        imageKey: t.imgKey,
        inventoryQty: t.qty * 6,
        feId,
        phId
      })
      results.push({ id: p.id, ...t })
    }
    return results
  }

  private async createCampaignWithOrders(args: {
    tmpl: CampaignTmpl
    merchantId: string
    products: Array<ProductTmpl & { id: string }>
    commCatId: string
    customers: { id: string }[]
    adminId: string | null
    minOrders: number
    maxOrders: number
  }): Promise<{ ordersCreated: number }> {
    const {
      tmpl,
      merchantId,
      products,
      commCatId,
      customers,
      adminId,
      minOrders,
      maxOrders
    } = args

    const campaign = await this.repo.createHistCampaign({
      merchantId,
      commissionCategoryId: commCatId,
      name: tmpl.name,
      description: tmpl.desc,
      startTime: tmpl.start,
      endTime: tmpl.end,
      commissionRate: this.COMMISSION_RATE,
      approvedBy: adminId,
      approvedAt: new Date(tmpl.start.getTime() - 86400000 * 2),
      createdAt: new Date(tmpl.start.getTime() - 86400000 * 3)
    })

    const cpRows = await Promise.all(
      tmpl.productOrder.map(pi =>
        this.repo.createCampaignProduct({
          campaignId: campaign.id,
          productId: products[pi].id,
          salePrice: products[pi].sale,
          saleQuantity: products[pi].qty,
          perUserLimit: 2,
          createdAt: new Date(tmpl.start.getTime() - 86400000 * 3)
        })
      )
    )

    // Sinh toàn bộ order chain in-memory
    const reservations: Prisma.ReservationCreateManyInput[] = []
    const stockAllocations: Prisma.StockAllocationCreateManyInput[] = []
    const orders: Prisma.OrderCreateManyInput[] = []
    const orderItems: Prisma.OrderItemCreateManyInput[] = []
    const payments: Prisma.PaymentCreateManyInput[] = []
    const commissionLedgers: Prisma.CommissionLedgerCreateManyInput[] = []

    // Map cpId → danh sách thời điểm order (dùng để tạo analytics snapshots)
    const orderTimesByCp = new Map<string, Date[]>()

    for (let cpi = 0; cpi < cpRows.length; cpi++) {
      const cp = cpRows[cpi]
      const product = products[tmpl.productOrder[cpi]]
      const numOrders = randInt(minOrders, maxOrders)
      const cpTimes: Date[] = []
      orderTimesByCp.set(cp.id, cpTimes)

      for (let oi = 0; oi < numOrders; oi++) {
        const cust = customers[oi % customers.length]
        const orderTime = randDate(tmpl.start, tmpl.end)
        cpTimes.push(orderTime)

        const resId = randomUUID()
        const ordId = randomUUID()
        const payId = randomUUID()
        const totalAmt = product.sale
        const commAmt = Math.round(totalAmt * this.COMMISSION_RATE)
        const netAmt = totalAmt - commAmt
        const cancelled = Math.random() < 0.05 // 5% đơn hủy

        reservations.push({
          id: resId,
          customerId: cust.id,
          campaignProductId: cp.id,
          quantity: 1,
          status: cancelled ? 'CANCELLED' : 'PAID',
          idempotencyKey: `hist:${cust.id}:${cp.id}:${oi}`,
          shippingAddress: fakeAddr(oi + cpi * 100),
          expiredAt: new Date(tmpl.start.getTime() + 15 * 60000),
          createdAt: orderTime
        })
        stockAllocations.push({
          id: randomUUID(),
          campaignProductId: cp.id,
          reservationId: resId,
          quantity: 1,
          createdAt: orderTime
        })

        if (!cancelled) {
          orders.push({
            id: ordId,
            customerId: cust.id,
            merchantId,
            reservationId: resId,
            idempotencyKey: `hist-ord:${cust.id}:${cp.id}:${oi}`,
            status: 'DONE',
            totalAmount: totalAmt,
            shippingAddress: fakeAddr(oi + cpi * 100),
            createdAt: new Date(orderTime.getTime() + 60000)
          })
          orderItems.push({
            id: randomUUID(),
            orderId: ordId,
            productId: product.id,
            quantity: 1,
            unitPrice: product.sale,
            originalPrice: product.price,
            createdAt: new Date(orderTime.getTime() + 60000)
          })
          payments.push({
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
          commissionLedgers.push({
            id: randomUUID(),
            orderId: ordId,
            paymentId: payId,
            campaignId: campaign.id,
            merchantId,
            commissionCategoryId: commCatId,
            commissionRate: this.COMMISSION_RATE,
            grossAmount: totalAmt,
            commissionAmount: commAmt,
            netAmount: netAmt,
            createdAt: new Date(orderTime.getTime() + 120000)
          })
        }
      }
    }

    await this.repo.batchInsertOrderChain({
      reservations,
      stockAllocations,
      orders,
      orderItems,
      payments,
      commissionLedgers
    })

    // Analytics snapshots (5-phút interval)
    await this.createSnapshots(
      campaign.id,
      cpRows,
      products,
      tmpl,
      orderTimesByCp
    )

    // Funnel events
    await this.createFunnelEvents(
      campaign.id,
      orders.length,
      tmpl.start,
      tmpl.end
    )

    return { ordersCreated: orders.length }
  }

  private async createSnapshots(
    campaignId: string,
    cpRows: { id: string }[],
    products: Array<ProductTmpl & { id: string }>,
    tmpl: CampaignTmpl,
    orderTimesByCp: Map<string, Date[]>
  ): Promise<void> {
    const INTERVAL_MS = 5 * 60 * 1000
    const snapshots: Prisma.CampaignAnalyticsSnapshotCreateManyInput[] = []

    for (let cpi = 0; cpi < cpRows.length; cpi++) {
      const cp = cpRows[cpi]
      const product = products[tmpl.productOrder[cpi]]
      const times = orderTimesByCp.get(cp.id) ?? []
      let sold = 0

      let t = new Date(tmpl.start)
      while (t <= tmpl.end) {
        const soldByNow = times.filter(d => d <= t).length
        const newSales = soldByNow - sold
        sold = soldByNow

        const stockRemaining = Math.max(0, product.qty - sold)
        const viewCount = randInt(sold * 5 + 2, sold * 12 + 10)

        snapshots.push({
          id: randomUUID(),
          campaignId,
          campaignProductId: cp.id,
          snapshotAt: new Date(t),
          stockRemaining,
          stockTotal: product.qty,
          stockRatio: stockRemaining / product.qty,
          purchaseCount: sold,
          revenue: sold * product.sale,
          conversionRate: viewCount > 0 ? sold / viewCount : 0,
          viewCount,
          clickCount: Math.floor(viewCount * 0.5),
          attemptCount: Math.max(sold, Math.floor(sold * 1.2)),
          purchasesLast5m: newSales,
          revenueVelocity: newSales * product.sale
        })
        t = new Date(t.getTime() + INTERVAL_MS)
      }
    }

    await this.repo.batchInsertSnapshots(snapshots)
  }

  private async createFunnelEvents(
    campaignId: string,
    totalPaid: number,
    start: Date,
    end: Date
  ): Promise<void> {
    const views = totalPaid * randInt(8, 12)
    const clicks = Math.floor(views * 0.45)
    const attempts = Math.floor(clicks * 0.55)
    const checkouts = Math.floor(attempts * 0.85)
    const initiated = Math.floor(checkouts * 0.9)

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
      { step: 'PAYMENT_SUCCESS', count: totalPaid }
    ]

    const events: Prisma.FunnelEventCreateManyInput[] = []
    for (const { step, count } of steps) {
      for (let i = 0; i < count; i++) {
        events.push({
          id: randomUUID(),
          sessionId: `sess-hist-${randomUUID().slice(0, 12)}`,
          campaignId,
          step,
          createdAt: randDate(start, end)
        })
      }
    }
    await this.repo.batchInsertFunnelEvents(events)
  }
}
