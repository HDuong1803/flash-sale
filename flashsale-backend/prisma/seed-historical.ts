/**
 * seed-historical.ts — Dữ liệu đầy đủ cho môi trường dev/staging
 *
 * Thêm vào DB (KHÔNG xóa data hiện tại):
 *   • 50 customer accounts (tên Việt thật, email thực tế)
 *   • 2 merchants bổ sung (TechZone Vietnam + SmartHome Plus)
 *   • 3 campaigns ENDED (03/03–03/04), 3 ACTIVE (đang chạy), 3 SCHEDULED (sắp tới)
 *   • Mỗi campaign: 10 CampaignProducts × 20-50 orders đầy đủ
 *   • ACTIVE campaign từ seed.ts: 120 orders với full chain
 *
 * Full chain mỗi đơn hàng (mirror luồng thực tế):
 *   Reservation → StockAllocation → Order → OrderItem
 *   → Payment (Stripe) → PaymentWebhookLog → CommissionLedger
 *   → FulfillmentOrder (GHN) → TrackingEvent → QcCheckpoint
 *   → Notification → StockAuditLog → OutboxEvent → UserActionLog
 *   → CampaignAnalyticsSnapshot (mỗi 5 phút) → FunnelEvent
 *
 * Chạy: cd flashsale-backend && pnpm seed (trước) rồi pnpm seed:historical
 */

import {
  FulfillmentStatus,
  LockStrategy,
  Prisma,
  PrismaClient,
  QcStatus
} from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

// ─── Cấu hình ─────────────────────────────────────────────────────────────────
const NUM_CUSTOMERS = 50
const NUM_ACTIVE_ORDERS = 120
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

interface ProductTmpl {
  name: string
  desc: string
  price: number
  sale: number
  qty: number
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
    desc: 'HEPA, Fluffy Optic head, LCD screen, 45 phút pin, hút 3D trực tiếp trên sàn',
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

type CampaignStatus = 'ENDED' | 'ACTIVE' | 'SCHEDULED'

interface CampaignTmpl {
  name: string
  desc: string
  start: Date
  end: Date
  status: CampaignStatus
  type: 'TECH' | 'HOME'
  catCode: string
  productOrder: number[]
}

// 3 ENDED (đã kết thúc) · 3 ACTIVE (đang chạy) · 3 SCHEDULED (sắp tới)
// Today = 2026-05-12 (UTC+7)
const CAMPAIGN_TMPLS: CampaignTmpl[] = [
  // ── ENDED ─────────────────────────────────────────────────────────────────
  {
    name: 'Flash Sale Khai Xuân Công Nghệ Tháng 3',
    desc: 'Khai xuân công nghệ: iPhone 14 Pro, Samsung S23 Ultra, MacBook Air M2, iPad Pro M2 giảm đến 33%. 12 giờ vàng, số lượng cực giới hạn!',
    start: new Date('2026-03-03T03:00:00Z'),
    end: new Date('2026-03-03T15:00:00Z'),
    status: 'ENDED',
    type: 'TECH',
    catCode: 'ELECTRONICS',
    productOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  },
  {
    name: 'Flash Sale Smart Home Tháng 3',
    desc: 'Smart home upgrade: Dyson V12, Roborock S7 MaxV, Philips Hue, Zojirushi. Giảm 35-40%, giao hàng trong ngày!',
    start: new Date('2026-03-13T03:00:00Z'),
    end: new Date('2026-03-13T15:00:00Z'),
    status: 'ENDED',
    type: 'HOME',
    catCode: 'HOME_APPLIANCE',
    productOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  },
  {
    name: 'Flash Sale Công Nghệ Đầu Tháng 4',
    desc: 'Tháng 4 bắt đầu rực rỡ: iPhone 14 Pro, Samsung S23 Ultra, MacBook Air M2 deal sốc, DJI Mini 3 Pro. Chỉ còn 12 giờ!',
    start: new Date('2026-04-03T03:00:00Z'),
    end: new Date('2026-04-03T15:00:00Z'),
    status: 'ENDED',
    type: 'TECH',
    catCode: 'ELECTRONICS',
    productOrder: [0, 1, 2, 8, 3, 4, 5, 6, 7, 9]
  },
  // ── ACTIVE (đang chạy — startTime trước hôm nay, endTime sau hôm nay) ───
  {
    name: 'Flash Sale Flagship Phones Tháng 5 - TechZone',
    desc: 'Deal lớn tháng 5: iPhone 14 Pro, MacBook Air M2, iPad Pro M2, AirPods Pro giảm đến 38%. Số lượng giới hạn, mua ngay hôm nay!',
    start: new Date('2026-05-06T03:00:00Z'),
    end: new Date('2026-05-16T15:00:00Z'),
    status: 'ACTIVE',
    type: 'TECH',
    catCode: 'ELECTRONICS',
    productOrder: [0, 2, 3, 4, 1, 5, 6, 7, 8, 9]
  },
  {
    name: 'Flash Sale Gia Dụng Thông Minh Tháng 5',
    desc: 'Nâng cấp tổ ấm tháng 5: Dyson V12, Roborock S7, Nespresso, Garmin. Freeship toàn quốc, bảo hành chính hãng 12 tháng!',
    start: new Date('2026-05-04T03:00:00Z'),
    end: new Date('2026-05-14T15:00:00Z'),
    status: 'ACTIVE',
    type: 'HOME',
    catCode: 'HOME_APPLIANCE',
    productOrder: [0, 6, 8, 9, 1, 2, 3, 4, 5, 7]
  },
  {
    name: 'Flash Sale Gaming & Wearables Giữa Tháng 5',
    desc: 'PS5, Sony XM4, Apple Watch, GoPro HERO11, DJI Mini 3 giảm sốc giữa tháng 5. Chỉ còn vài ngày — đừng bỏ lỡ!',
    start: new Date('2026-05-09T03:00:00Z'),
    end: new Date('2026-05-19T15:00:00Z'),
    status: 'ACTIVE',
    type: 'TECH',
    catCode: 'ELECTRONICS',
    productOrder: [6, 5, 7, 8, 9, 4, 0, 1, 2, 3]
  },
  // ── SCHEDULED (sắp khai mạc) ──────────────────────────────────────────────
  {
    name: 'Flash Sale Smart Kitchen Cuối Tháng 5',
    desc: 'Góc bếp thông minh: Zojirushi IH, Cosori Air Fryer, Nespresso Vertuo, BlendJet. Đăng ký nhận thông báo ngay!',
    start: new Date('2026-05-14T03:00:00Z'),
    end: new Date('2026-05-24T15:00:00Z'),
    status: 'SCHEDULED',
    type: 'HOME',
    catCode: 'HOME_APPLIANCE',
    productOrder: [1, 2, 8, 7, 4, 5, 3, 0, 6, 9]
  },
  {
    name: 'Flash Sale Thiết Bị Âm Thanh & Chụp Ảnh',
    desc: 'Sony WH-1000XM4, AirPods Pro, GoPro HERO11, DJI Mini 3 Pro. Mùa hè rực rỡ — ghi lại từng khoảnh khắc đáng nhớ!',
    start: new Date('2026-05-15T03:00:00Z'),
    end: new Date('2026-05-25T15:00:00Z'),
    status: 'SCHEDULED',
    type: 'TECH',
    catCode: 'ELECTRONICS',
    productOrder: [5, 4, 9, 8, 7, 6, 0, 1, 2, 3]
  },
  {
    name: 'Flash Sale Gia Dụng Cao Cấp Cuối Tháng 5',
    desc: 'Kangaroo RO Hydrogen, JBL Flip 6, Philips Hue, Roborock S7. Tổ ấm hiện đại, giao hàng miễn phí, lắp đặt tận nơi!',
    start: new Date('2026-05-16T03:00:00Z'),
    end: new Date('2026-05-26T15:00:00Z'),
    status: 'SCHEDULED',
    type: 'HOME',
    catCode: 'HOME_APPLIANCE',
    productOrder: [5, 3, 4, 6, 0, 1, 2, 7, 8, 9]
  }
]

// ─── Dữ liệu thực tế ──────────────────────────────────────────────────────────

const VIET_NAMES = [
  'Nguyễn Văn An',
  'Trần Thị Bích',
  'Lê Hoàng Cường',
  'Phạm Thị Dung',
  'Hoàng Minh Đức',
  'Vũ Thị Hà',
  'Đặng Quốc Hùng',
  'Bùi Thị Hương',
  'Ngô Thanh Khoa',
  'Dương Thị Lan',
  'Đinh Văn Long',
  'Trịnh Thị Mai',
  'Lý Công Minh',
  'Phan Thị Nga',
  'Tô Văn Phong',
  'Hồ Thị Quỳnh',
  'Võ Minh Sơn',
  'Đỗ Thị Tâm',
  'Nguyễn Văn Thắng',
  'Trần Thị Thu',
  'Lê Quốc Toàn',
  'Phạm Thị Trang',
  'Hoàng Văn Trung',
  'Vũ Thị Tuyết',
  'Đặng Minh Tuấn',
  'Bùi Văn Út',
  'Ngô Thị Vân',
  'Dương Văn Việt',
  'Đinh Thị Xuân',
  'Trịnh Văn Yên',
  'Lý Thị Ánh',
  'Phan Văn Bảo',
  'Tô Thị Chi',
  'Hồ Văn Chiến',
  'Võ Thị Duyên',
  'Đỗ Văn Em',
  'Nguyễn Thị Giang',
  'Trần Văn Hải',
  'Lê Thị Hiền',
  'Phạm Văn Hiếu',
  'Hoàng Thị Hoa',
  'Vũ Văn Hoàng',
  'Đặng Thị Huệ',
  'Bùi Văn Hưng',
  'Ngô Thị Khánh',
  'Dương Văn Kiên',
  'Đinh Thị Kim',
  'Trịnh Văn Lâm',
  'Lý Thị Liên',
  'Phan Văn Linh'
]

// Email slug phát sinh từ index (tên không có dấu)
const EMAIL_SLUGS = [
  'nguyen.van.an',
  'tran.thi.bich',
  'le.hoang.cuong',
  'pham.thi.dung',
  'hoang.minh.duc',
  'vu.thi.ha',
  'dang.quoc.hung',
  'bui.thi.huong',
  'ngo.thanh.khoa',
  'duong.thi.lan',
  'dinh.van.long',
  'trinh.thi.mai',
  'ly.cong.minh',
  'phan.thi.nga',
  'to.van.phong',
  'ho.thi.quynh',
  'vo.minh.son',
  'do.thi.tam',
  'nguyen.van.thang',
  'tran.thi.thu',
  'le.quoc.toan',
  'pham.thi.trang',
  'hoang.van.trung',
  'vu.thi.tuyet',
  'dang.minh.tuan',
  'bui.van.ut',
  'ngo.thi.van',
  'duong.van.viet',
  'dinh.thi.xuan',
  'trinh.van.yen',
  'ly.thi.anh',
  'phan.van.bao',
  'to.thi.chi',
  'ho.van.chien',
  'vo.thi.duyen',
  'do.van.em',
  'nguyen.thi.giang',
  'tran.van.hai',
  'le.thi.hien',
  'pham.van.hieu',
  'hoang.thi.hoa',
  'vu.van.hoang',
  'dang.thi.hue',
  'bui.van.hung',
  'ngo.thi.khanh',
  'duong.van.kien',
  'dinh.thi.kim',
  'trinh.van.lam',
  'ly.thi.lien',
  'phan.van.linh'
]

// Pool địa chỉ theo định dạng GHN thực tế
interface GHNAddress {
  to_address: string
  to_ward_code: string
  to_ward_name: string
  to_district_id: number
  to_district_name: string
  to_province_id: number
  to_province_name: string
}

const ADDRESS_POOL: GHNAddress[] = [
  {
    to_address: '123 Nguyễn Huệ',
    to_ward_code: '20308',
    to_ward_name: 'Phường Bến Nghé',
    to_district_id: 1442,
    to_district_name: 'Quận 1',
    to_province_id: 202,
    to_province_name: 'Hồ Chí Minh'
  },
  {
    to_address: '45 Lê Lợi',
    to_ward_code: '20309',
    to_ward_name: 'Phường Bến Thành',
    to_district_id: 1442,
    to_district_name: 'Quận 1',
    to_province_id: 202,
    to_province_name: 'Hồ Chí Minh'
  },
  {
    to_address: '88 Nguyễn Thị Minh Khai',
    to_ward_code: '20512',
    to_ward_name: 'Phường 6',
    to_district_id: 1443,
    to_district_name: 'Quận 3',
    to_province_id: 202,
    to_province_name: 'Hồ Chí Minh'
  },
  {
    to_address: '200 Đinh Tiên Hoàng',
    to_ward_code: '20808',
    to_ward_name: 'Phường 1',
    to_district_id: 1444,
    to_district_name: 'Bình Thạnh',
    to_province_id: 202,
    to_province_name: 'Hồ Chí Minh'
  },
  {
    to_address: '56 Cách Mạng Tháng 8',
    to_ward_code: '20710',
    to_ward_name: 'Phường 9',
    to_district_id: 1446,
    to_district_name: 'Tân Bình',
    to_province_id: 202,
    to_province_name: 'Hồ Chí Minh'
  },
  {
    to_address: '34 Trần Duy Hưng',
    to_ward_code: '1A0301',
    to_ward_name: 'Phường Trung Hoà',
    to_district_id: 1491,
    to_district_name: 'Cầu Giấy',
    to_province_id: 201,
    to_province_name: 'Hà Nội'
  },
  {
    to_address: '78 Đống Đa',
    to_ward_code: '1A0712',
    to_ward_name: 'Phường Nguyễn Du',
    to_district_id: 1488,
    to_district_name: 'Hai Bà Trưng',
    to_province_id: 201,
    to_province_name: 'Hà Nội'
  },
  {
    to_address: '15 Hàng Bài',
    to_ward_code: '1A0201',
    to_ward_name: 'Phường Hoàn Kiếm',
    to_district_id: 1484,
    to_district_name: 'Hoàn Kiếm',
    to_province_id: 201,
    to_province_name: 'Hà Nội'
  },
  {
    to_address: '99 Nguyễn Chí Thanh',
    to_ward_code: '1A0601',
    to_ward_name: 'Phường Láng Thượng',
    to_district_id: 1485,
    to_district_name: 'Đống Đa',
    to_province_id: 201,
    to_province_name: 'Hà Nội'
  },
  {
    to_address: '12 Bạch Đằng',
    to_ward_code: '52603',
    to_ward_name: 'Phường Thạch Thang',
    to_district_id: 490,
    to_district_name: 'Hải Châu',
    to_province_id: 518,
    to_province_name: 'Đà Nẵng'
  },
  {
    to_address: '33 Hải Phòng',
    to_ward_code: '52702',
    to_ward_name: 'Phường Thanh Khê Đông',
    to_district_id: 491,
    to_district_name: 'Thanh Khê',
    to_province_id: 518,
    to_province_name: 'Đà Nẵng'
  },
  {
    to_address: '67 Trần Phú',
    to_ward_code: '90302',
    to_ward_name: 'Phường Tân An',
    to_district_id: 916,
    to_district_name: 'Ninh Kiều',
    to_province_id: 48,
    to_province_name: 'Cần Thơ'
  },
  {
    to_address: '11 Ngô Quyền',
    to_ward_code: '31012',
    to_ward_name: 'Phường Máy Tơ',
    to_district_id: 1475,
    to_district_name: 'Ngô Quyền',
    to_province_id: 31,
    to_province_name: 'Hải Phòng'
  },
  {
    to_address: '25 Quang Trung',
    to_ward_code: '34001',
    to_ward_name: 'Phường Trần Hưng Đạo',
    to_district_id: 1462,
    to_district_name: 'Thành phố Nha Trang',
    to_province_id: 34,
    to_province_name: 'Khánh Hoà'
  },
  {
    to_address: '8 Lê Hồng Phong',
    to_ward_code: '37201',
    to_ward_name: 'Phường 1',
    to_district_id: 1479,
    to_district_name: 'Thành phố Vũng Tàu',
    to_province_id: 77,
    to_province_name: 'Bà Rịa - Vũng Tàu'
  }
]

const PHONES = [
  '0901234567',
  '0912345678',
  '0923456789',
  '0934567890',
  '0945678901',
  '0956789012',
  '0967890123',
  '0978901234',
  '0989012345',
  '0390123456',
  '0381234567',
  '0372345678',
  '0363456789',
  '0354567890',
  '0345678901',
  '0336789012',
  '0327890123',
  '0318901234',
  '0309012345',
  '0702345678',
  '0703456789',
  '0704567890',
  '0705678901',
  '0706789012',
  '0707890123',
  '0708901234',
  '0709012345',
  '0710123456',
  '0711234567',
  '0712345678',
  '0713456789',
  '0714567890',
  '0715678901',
  '0716789012',
  '0717890123',
  '0718901234',
  '0719012345',
  '0720123456',
  '0721234567',
  '0722345678',
  '0723456789',
  '0724567890',
  '0725678901',
  '0726789012',
  '0727890123',
  '0728901234',
  '0729012345',
  '0865664703',
  '0836789012',
  '0847890123'
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

function ghnOrderCode(used: Set<string>): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'
  let code: string
  do {
    code = Array.from(
      { length: 6 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('')
  } while (used.has(code))
  used.add(code)
  return code
}

function stripeSessionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const rand = Array.from(
    { length: 58 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')
  return `cs_test_${rand}`
}

function buildShippingAddress(idx: number, name: string): string {
  const addr = ADDRESS_POOL[idx % ADDRESS_POOL.length]
  const phone = PHONES[idx % PHONES.length]
  return JSON.stringify({
    to_name: name,
    to_phone: phone,
    to_address: addr.to_address,
    to_ward_code: addr.to_ward_code,
    to_ward_name: addr.to_ward_name,
    to_district_id: addr.to_district_id,
    to_district_name: addr.to_district_name,
    to_province_id: addr.to_province_id,
    to_province_name: addr.to_province_name
  })
}

function normalizedAddress(idx: number, name: string): object {
  const addr = ADDRESS_POOL[idx % ADDRESS_POOL.length]
  const phone = PHONES[idx % PHONES.length]
  return {
    to_name: name,
    to_phone: phone,
    to_address: addr.to_address,
    to_ward_code: addr.to_ward_code,
    to_ward_name: addr.to_ward_name,
    to_district_id: addr.to_district_id,
    to_district_name: addr.to_district_name,
    to_province_name: addr.to_province_name
  }
}

function ghnWebhookPayload(
  orderCode: string,
  status: string,
  time: Date
): object {
  return {
    CODAmount: 0,
    Description:
      status === 'in_transit'
        ? 'Đơn hàng đang vận chuyển'
        : 'Giao hàng thành công',
    OrderCode: orderCode,
    Status: status,
    Time: time.toISOString(),
    TrackingNumber: orderCode,
    Type: 'SELLER'
  }
}

// ─── Tạo product ──────────────────────────────────────────────────────────────
async function createProduct(
  merchantId: string,
  tmpl: ProductTmpl,
  idx: number
): Promise<{ id: string } & ProductTmpl> {
  const imgUrl = IMG[tmpl.img] ?? IMG['iphone']
  const feId = `fe${idx}-${randomUUID().slice(0, 8)}`
  const phId = `ph${idx}-${randomUUID().slice(0, 8)}`

  await prisma.fileEntity.create({
    data: {
      id: feId,
      fileName: `${tmpl.img}-${idx}.jpg`,
      url: imgUrl,
      mimeType: 'image/jpeg',
      size: 204800,
      description: `Ảnh sản phẩm: ${tmpl.name}`,
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

// ─── Analytics snapshots mỗi 5 phút ─────────────────────────────────────────
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

    let cursor = new Date(start)
    while (cursor <= end) {
      const salesByNow = orderTimes.filter(t => t <= cursor).length
      const newSales = salesByNow - sold
      sold = salesByNow
      const revenue = sold * cp.qty

      const stockRemaining = Math.max(0, cp.saleQty - sold)
      const viewCount = randInt(sold * 5, sold * 10 + 10)

      snapshots.push({
        id: randomUUID(),
        campaignId,
        campaignProductId: cp.id,
        snapshotAt: new Date(cursor),
        stockRemaining,
        stockTotal: cp.saleQty,
        stockRatio: stockRemaining / cp.saleQty,
        purchaseCount: sold,
        revenue,
        conversionRate: viewCount > 0 ? sold / viewCount : 0,
        viewCount,
        clickCount: randInt(
          Math.floor(viewCount * 0.4),
          Math.floor(viewCount * 0.7)
        ),
        attemptCount: randInt(sold, Math.floor(sold * 1.3) + 1),
        purchasesLast5m: newSales,
        revenueVelocity: newSales * cp.qty * 200
      })

      cursor = new Date(cursor.getTime() + intervalMs)
    }
  }

  for (let i = 0; i < snapshots.length; i += 500) {
    await prisma.campaignAnalyticsSnapshot.createMany({
      data: snapshots.slice(i, i + 500)
    })
  }
}

// ─── Funnel events ────────────────────────────────────────────────────────────
async function createFunnelEvents(
  campaignId: string,
  customers: Array<{ id: string }>,
  paidOrders: number,
  start: Date,
  end: Date
): Promise<void> {
  const views = Math.floor(paidOrders * randInt(8, 12))
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
    { step: 'PAYMENT_SUCCESS', count: paidOrders }
  ]

  const funnelData: Parameters<
    typeof prisma.funnelEvent.createMany
  >[0]['data'] = []
  for (const { step, count } of steps) {
    for (let i = 0; i < count; i++) {
      const isLoggedIn =
        i < paidOrders && (step === 'PAYMENT_SUCCESS' || Math.random() > 0.4)
      funnelData.push({
        id: randomUUID(),
        sessionId: `sess-${randomUUID().slice(0, 12)}`,
        campaignId,
        step,
        userId: isLoggedIn ? customers[i % customers.length].id : null,
        createdAt: randDate(start, end)
      })
    }
  }

  for (let i = 0; i < funnelData.length; i += 1000) {
    await prisma.funnelEvent.createMany({ data: funnelData.slice(i, i + 1000) })
  }
}

// ─── Dọn dẹp data cũ của 2 merchants trước khi seed lại ─────────────────────
async function cleanupSeedData(
  merchantIds: string[],
  seedCustomerEmails: string[]
): Promise<void> {
  process.stdout.write('🗑️  Dọn dẹp data cũ...')

  const campaigns = await prisma.campaign.findMany({
    where: { merchantId: { in: merchantIds } },
    select: { id: true }
  })
  const campaignIds = campaigns.map(c => c.id)

  if (campaignIds.length === 0) {
    console.log(' không có gì để xóa')
    return
  }

  const cps = campaignIds.length
    ? await prisma.campaignProduct.findMany({
        where: { campaignId: { in: campaignIds } },
        select: { id: true }
      })
    : []
  const cpIds = cps.map(c => c.id)

  const reservations = cpIds.length
    ? await prisma.reservation.findMany({
        where: { campaignProductId: { in: cpIds } },
        select: { id: true }
      })
    : []
  const resIds = reservations.map(r => r.id)

  const orders = resIds.length
    ? await prisma.order.findMany({
        where: { reservationId: { in: resIds } },
        select: { id: true }
      })
    : []
  const orderIds = orders.map(o => o.id)

  const fulfillments = orderIds.length
    ? await prisma.fulfillmentOrder.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true }
      })
    : []
  const fulfIds = fulfillments.map(f => f.id)

  const payments = resIds.length
    ? await prisma.payment.findMany({
        where: { reservationId: { in: resIds } },
        select: { id: true }
      })
    : []
  const payIds = payments.map(p => p.id)

  // Xóa theo thứ tự FK: leaf → root
  if (fulfIds.length) {
    await prisma.trackingEvent.deleteMany({
      where: { fulfillmentId: { in: fulfIds } }
    })
    await prisma.fulfillmentOrder.deleteMany({ where: { id: { in: fulfIds } } })
  }
  if (orderIds.length) {
    await prisma.qcCheckpoint.deleteMany({
      where: { orderId: { in: orderIds } }
    })
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: orderIds } }
    })
    await prisma.commissionLedger.deleteMany({
      where: { orderId: { in: orderIds } }
    })
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
  }
  if (payIds.length) {
    await prisma.paymentWebhookLog.deleteMany({
      where: { paymentId: { in: payIds } }
    })
    await prisma.payment.deleteMany({ where: { id: { in: payIds } } })
  }
  if (resIds.length) {
    await prisma.stockAuditLog.deleteMany({
      where: { referenceId: { in: resIds } }
    })
    await prisma.stockAllocation.deleteMany({
      where: { reservationId: { in: resIds } }
    })
    await prisma.reservation.deleteMany({ where: { id: { in: resIds } } })
  }
  if (campaignIds.length) {
    await prisma.funnelEvent.deleteMany({
      where: { campaignId: { in: campaignIds } }
    })
    await prisma.campaignAnalyticsSnapshot.deleteMany({
      where: { campaignId: { in: campaignIds } }
    })
    await prisma.campaignProduct.deleteMany({
      where: { campaignId: { in: campaignIds } }
    })
    await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } })
  }

  // Products (cascade: inventory, images)
  const products = await prisma.product.findMany({
    where: { merchantId: { in: merchantIds } },
    select: { id: true }
  })
  const productIds = products.map(p => p.id)
  if (productIds.length) {
    await prisma.stockAuditLog.deleteMany({
      where: { productId: { in: productIds } }
    })
    await prisma.product.deleteMany({ where: { id: { in: productIds } } })
  }

  // Notifications và action logs của seed customers
  const seedUsers = await prisma.user.findMany({
    where: { email: { in: seedCustomerEmails } },
    select: { id: true }
  })
  const seedUserIds = seedUsers.map(u => u.id)
  if (seedUserIds.length) {
    await prisma.notification.deleteMany({
      where: { userId: { in: seedUserIds } }
    })
    await prisma.userActionLog.deleteMany({
      where: { userId: { in: seedUserIds } }
    })
  }

  console.log(
    ` ✅ Xóa ${campaigns.length} campaigns, ${orders.length} orders, ${products.length} products`
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🌱 Seed dữ liệu bắt đầu...\n')
  const t0 = Date.now()

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

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true }
  })
  const adminId = admin?.id ?? null

  const pw = await bcrypt.hash('Test@123456', 10)

  // Merchants bổ sung (không phải test/demo)
  const techMerchUser = await prisma.user.upsert({
    where: { email: 'contact@techzone.vn' },
    update: {},
    create: {
      email: 'contact@techzone.vn',
      fullName: 'Nguyễn Quang Khải',
      passwordHash: pw,
      role: 'MERCHANT',
      emailVerified: true,
      status: 'ACTIVE'
    }
  })
  const techMerch = await prisma.merchantProfile.upsert({
    where: { taxCode: '9901230001' },
    update: {},
    create: {
      userId: techMerchUser.id,
      businessName: 'TechZone Vietnam',
      taxCode: '9901230001',
      description:
        'Phân phối chính hãng thiết bị điện tử: iPhone, Samsung, MacBook, iPad. Bảo hành toàn quốc 12 tháng.',
      phone: '0281990001',
      address: '120 Lý Thường Kiệt, Tân Bình, TP.HCM',
      kycStatus: 'APPROVED',
      approvedAt: new Date('2026-01-10'),
      approvedBy: adminId
    }
  })

  const homeMerchUser = await prisma.user.upsert({
    where: { email: 'sales@smarthomeplus.vn' },
    update: {},
    create: {
      email: 'sales@smarthomeplus.vn',
      fullName: 'Trần Hoài Nam',
      passwordHash: pw,
      role: 'MERCHANT',
      emailVerified: true,
      status: 'ACTIVE'
    }
  })
  const homeMerch = await prisma.merchantProfile.upsert({
    where: { taxCode: '9901230002' },
    update: {},
    create: {
      userId: homeMerchUser.id,
      businessName: 'SmartHome Plus',
      taxCode: '9901230002',
      description:
        'Thiết bị gia dụng cao cấp: Dyson, Roborock, Zojirushi, Nespresso. Tư vấn lắp đặt miễn phí toàn quốc.',
      phone: '0241990002',
      address: '88 Hoàng Quốc Việt, Cầu Giấy, Hà Nội',
      kycStatus: 'APPROVED',
      approvedAt: new Date('2026-01-10'),
      approvedBy: adminId
    }
  })
  console.log('✅ Merchants: TechZone Vietnam, SmartHome Plus')

  // 50 customers với tên và email thực tế
  process.stdout.write(`🔧 Tạo ${NUM_CUSTOMERS} customers...`)
  const customers: { id: string; fullName: string }[] = []
  for (let b = 0; b < NUM_CUSTOMERS / 10; b++) {
    const batch = await Promise.all(
      Array.from({ length: 10 }, (_, j) => {
        const idx = b * 10 + j
        const name = VIET_NAMES[idx]
        const email = `${EMAIL_SLUGS[idx]}@gmail.com`
        const phone = PHONES[idx]
        const addr = ADDRESS_POOL[idx % ADDRESS_POOL.length]
        return prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            fullName: name,
            passwordHash: pw,
            role: 'CUSTOMER',
            emailVerified: true,
            status: 'ACTIVE',
            customerProfile: {
              create: {
                phone,
                defaultAddress: `${addr.to_address}, ${addr.to_ward_name}, ${addr.to_district_name}, ${addr.to_province_name}`
              }
            }
          },
          select: { id: true, fullName: true }
        })
      })
    )
    customers.push(...batch)
    process.stdout.write(` ${Math.min((b + 1) * 10, NUM_CUSTOMERS)}`)
  }
  console.log('\n✅ Customers đã tạo')

  // Luôn xóa data cũ của 2 merchants trước khi tạo lại
  const seedEmails = EMAIL_SLUGS.map(s => `${s}@gmail.com`)
  await cleanupSeedData([techMerch.id, homeMerch.id], seedEmails)

  const usedGhnCodes = new Set<string>()
  let totalOrders = 0
  let totalCPs = 0

  {
    process.stdout.write('🔧 Tạo 20 products...')
    const techProds = await Promise.all(
      TECH_PRODUCTS.map((t, i) => createProduct(techMerch.id, t, i))
    )
    const homeProds = await Promise.all(
      HOME_PRODUCTS.map((t, i) => createProduct(homeMerch.id, t, i + 10))
    )
    console.log(' ✅ 20 products đã tạo')

    const soldByProductId = new Map<string, number>()

    for (let ci = 0; ci < CAMPAIGN_TMPLS.length; ci++) {
      const tmpl = CAMPAIGN_TMPLS[ci]
      const isTech = tmpl.type === 'TECH'
      const merchantId = isTech ? techMerch.id : homeMerch.id
      const products = isTech ? techProds : homeProds
      const commCatId = isTech ? catElec.id : catHome.id

      const campaign = await prisma.campaign.create({
        data: {
          merchantId,
          commissionCategoryId: commCatId,
          name: tmpl.name,
          description: tmpl.desc,
          status: tmpl.status,
          startTime: tmpl.start,
          endTime: tmpl.end,
          commissionRate: COMMISSION_RATE,
          approvedAt: new Date(tmpl.start.getTime() - 86400000 * 2),
          approvedBy: adminId,
          createdAt: new Date(tmpl.start.getTime() - 86400000 * 3)
        }
      })

      // SCHEDULED: chỉ tạo campaign + products, không có orders
      const isScheduled = tmpl.status === 'SCHEDULED'
      const cpRows = await Promise.all(
        tmpl.productOrder.map(pi => {
          const p = products[pi]
          return prisma.campaignProduct.create({
            data: {
              campaignId: campaign.id,
              productId: p.id,
              salePrice: p.sale,
              saleQuantity: p.qty,
              remainingQuantity: isScheduled ? p.qty : 0, // SCHEDULED còn đủ hàng
              perUserLimit: 2,
              createdAt: new Date(tmpl.start.getTime() - 86400000 * 3)
            }
          })
        })
      )
      totalCPs += cpRows.length

      if (isScheduled) {
        console.log(`  ✅ [${ci + 1}/9] "${tmpl.name}" — SCHEDULED (no orders)`)
        continue
      }

      const resList: Prisma.ReservationCreateManyInput[] = []
      const saList: Prisma.StockAllocationCreateManyInput[] = []
      const ordList: Prisma.OrderCreateManyInput[] = []
      const oiList: Prisma.OrderItemCreateManyInput[] = []
      const payList: Prisma.PaymentCreateManyInput[] = []
      const webhookList: Prisma.PaymentWebhookLogCreateManyInput[] = []
      const clList: Prisma.CommissionLedgerCreateManyInput[] = []
      const fulfOrderList: Prisma.FulfillmentOrderCreateManyInput[] = []
      const trackList: Prisma.TrackingEventCreateManyInput[] = []
      const auditList: Prisma.StockAuditLogCreateManyInput[] = []
      const qcList: Prisma.QcCheckpointCreateManyInput[] = []
      const notifList: Prisma.NotificationCreateManyInput[] = []
      const outboxList: Prisma.OutboxEventCreateManyInput[] = []
      const actionLogList: Prisma.UserActionLogCreateManyInput[] = []
      const paidCountByCp: Record<string, number> = {}
      const orderTimesByCp = new Map<string, Date[]>()
      // ACTIVE: phân bổ thời gian đến hiện tại
      const distribEnd =
        tmpl.status === 'ACTIVE'
          ? new Date(Math.min(Date.now(), tmpl.end.getTime()))
          : tmpl.end

      for (let cpi = 0; cpi < cpRows.length; cpi++) {
        const cp = cpRows[cpi]
        const product = products[tmpl.productOrder[cpi]]
        const numOrders = randInt(MIN_ORDERS, MAX_ORDERS)
        const cpTimes: Date[] = []
        orderTimesByCp.set(cp.id, cpTimes)

        for (let oi = 0; oi < numOrders; oi++) {
          const cust = customers[oi % NUM_CUSTOMERS]
          const orderTime = randDate(tmpl.start, distribEnd)
          cpTimes.push(orderTime)

          const resId = randomUUID()
          const ordId = randomUUID()
          const payId = randomUUID()
          const fulfId = randomUUID()
          const qty = 1
          const totalAmt = product.sale * qty
          const commAmt = Math.round(totalAmt * COMMISSION_RATE)
          const netAmt = totalAmt - commAmt
          const cancelled = Math.random() < 0.05
          const addrIdx = (oi + cpi * 100 + ci * 10000) % ADDRESS_POOL.length
          const shippingAddr = buildShippingAddress(addrIdx, cust.fullName)
          const txId = stripeSessionId()
          const orderCreatedAt = new Date(orderTime.getTime() + 60_000)

          // ENDED: tất cả đơn đã DONE; ACTIVE: xác định theo tuổi đơn hàng
          const ageHours = (Date.now() - orderTime.getTime()) / 3_600_000
          const orderStatus: 'DONE' | 'SHIPPING' | 'CONFIRMED' =
            tmpl.status === 'ENDED'
              ? 'DONE'
              : ageHours > 12
              ? 'DONE'
              : ageHours > 4
              ? 'SHIPPING'
              : 'CONFIRMED'
          const fulfillStatus: FulfillmentStatus =
            orderStatus === 'DONE'
              ? FulfillmentStatus.DELIVERED
              : orderStatus === 'SHIPPING'
              ? FulfillmentStatus.IN_TRANSIT
              : FulfillmentStatus.AWAITING

          resList.push({
            id: resId,
            customerId: cust.id,
            campaignProductId: cp.id,
            quantity: qty,
            status: cancelled ? 'CANCELLED' : 'PAID',
            idempotencyKey: `${cp.id}:${cust.id}:${oi}`,
            shippingAddress: shippingAddr,
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

          actionLogList.push({
            id: randomUUID(),
            userId: cust.id,
            ip: `${randInt(1, 254)}.${randInt(1, 254)}.${randInt(
              1,
              254
            )}.${randInt(1, 254)}`,
            action: 'purchase',
            targetId: campaign.id,
            createdAt: new Date(orderTime.getTime() - 30_000)
          })

          if (!cancelled) {
            ordList.push({
              id: ordId,
              customerId: cust.id,
              merchantId,
              reservationId: resId,
              idempotencyKey: payId,
              status: orderStatus,
              totalAmount: totalAmt,
              shippingAddress: shippingAddr,
              createdAt: orderCreatedAt
            })

            oiList.push({
              id: randomUUID(),
              orderId: ordId,
              productId: product.id,
              quantity: qty,
              unitPrice: product.sale,
              originalPrice: product.price,
              createdAt: orderCreatedAt
            })

            payList.push({
              id: payId,
              reservationId: resId,
              orderId: ordId,
              amount: totalAmt,
              method: 'STRIPE',
              status: 'SUCCESS',
              transactionId: txId,
              idempotencyKey: `checkout:${resId}`,
              paidAt: new Date(orderTime.getTime() + 120_000),
              createdAt: new Date(orderTime.getTime() + 90_000)
            })

            webhookList.push({
              id: randomUUID(),
              paymentId: payId,
              provider: 'stripe',
              transactionId: txId,
              payload: {
                id: `evt_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
                object: 'event',
                type: 'checkout.session.completed',
                data: {
                  object: {
                    id: txId,
                    amount_total: totalAmt,
                    currency: 'vnd',
                    payment_status: 'paid',
                    status: 'complete',
                    metadata: { reservationId: resId }
                  }
                }
              } as unknown as Prisma.InputJsonValue,
              processed: true,
              processedAt: new Date(orderTime.getTime() + 125_000),
              createdAt: new Date(orderTime.getTime() + 120_000)
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
              createdAt: new Date(orderTime.getTime() + 120_000)
            })

            const ghnCode = ghnOrderCode(usedGhnCodes)
            const labelBookedAt =
              orderStatus !== 'CONFIRMED'
                ? new Date(orderCreatedAt.getTime() + randInt(20, 60) * 60_000)
                : null
            const shippedAt =
              orderStatus === 'SHIPPING' || orderStatus === 'DONE'
                ? new Date(
                    (labelBookedAt ?? orderCreatedAt).getTime() +
                      randInt(2, 5) * 3_600_000
                  )
                : null
            const deliveredAt =
              orderStatus === 'DONE'
                ? new Date(
                    (shippedAt ?? orderCreatedAt).getTime() +
                      randInt(20, 48) * 3_600_000
                  )
                : null
            const normalizedAddr = normalizedAddress(addrIdx, cust.fullName)

            fulfOrderList.push({
              id: fulfId,
              orderId: ordId,
              carrierId: null,
              ghnOrderCode: ghnCode,
              ghnServiceId: '2',
              labelUrl: labelBookedAt
                ? `https://tracking.ghn.dev/?order_code=${ghnCode}`
                : null,
              trackingUrl: labelBookedAt
                ? `https://tracking.ghn.dev/?order_code=${ghnCode}`
                : null,
              trackingNumber: labelBookedAt ? ghnCode : null,
              fulfillStatus,
              labelCostCents: labelBookedAt ? randInt(22000, 80000) : null,
              addressValidated: true,
              normalizedAddress:
                normalizedAddr as unknown as Prisma.InputJsonValue,
              labelBookedAt,
              shippedAt,
              deliveredAt,
              createdAt: orderCreatedAt
            })

            if (shippedAt) {
              trackList.push({
                id: randomUUID(),
                fulfillmentId: fulfId,
                carrierStatus: 'in_transit',
                description: 'Đơn hàng đang vận chuyển',
                location:
                  ADDRESS_POOL[addrIdx % ADDRESS_POOL.length].to_province_name,
                occurredAt: shippedAt,
                sourcePayload: ghnWebhookPayload(
                  ghnCode,
                  'in_transit',
                  shippedAt
                ) as unknown as Prisma.InputJsonValue,
                createdAt: shippedAt
              })
            }
            if (deliveredAt) {
              trackList.push({
                id: randomUUID(),
                fulfillmentId: fulfId,
                carrierStatus: 'delivered',
                description: 'Giao hàng thành công',
                location: `${
                  ADDRESS_POOL[addrIdx % ADDRESS_POOL.length].to_district_name
                }, ${
                  ADDRESS_POOL[addrIdx % ADDRESS_POOL.length].to_province_name
                }`,
                occurredAt: deliveredAt,
                sourcePayload: ghnWebhookPayload(
                  ghnCode,
                  'delivered',
                  deliveredAt
                ) as unknown as Prisma.InputJsonValue,
                createdAt: deliveredAt
              })
            }

            if (adminId) {
              qcList.push({
                id: randomUUID(),
                orderId: ordId,
                inspectorId: adminId,
                status: QcStatus.PASSED,
                checklist: [
                  {
                    key: 'item_count',
                    label: 'Số lượng sản phẩm đúng',
                    passed: true
                  },
                  {
                    key: 'packaging',
                    label: 'Đóng gói nguyên vẹn',
                    passed: true
                  },
                  {
                    key: 'label_match',
                    label: 'Label khớp với đơn hàng',
                    passed: true
                  },
                  {
                    key: 'no_damage',
                    label: 'Sản phẩm không bị hỏng hóc',
                    passed: true
                  }
                ] as unknown as Prisma.InputJsonValue,
                photoUrls: [],
                passedAt: new Date(orderCreatedAt.getTime() + 20 * 60_000),
                createdAt: new Date(orderCreatedAt.getTime() + 15 * 60_000)
              })
            }

            notifList.push({
              id: randomUUID(),
              userId: cust.id,
              type: 'ORDER_CONFIRMED',
              title: 'Đặt hàng thành công!',
              message: 'Đơn hàng của bạn đã được xác nhận và đang được xử lý.',
              read: Math.random() > 0.4,
              createdAt: new Date(orderCreatedAt.getTime() + 2_000)
            })
            if (deliveredAt) {
              notifList.push({
                id: randomUUID(),
                userId: cust.id,
                type: 'ORDER_DELIVERED',
                title: 'Đơn hàng đã giao thành công',
                message: `Đơn hàng ${ordId} đã được giao. Cảm ơn bạn đã mua sắm!`,
                read: Math.random() > 0.2,
                createdAt: new Date(deliveredAt.getTime() + 5_000)
              })
            }

            auditList.push({
              id: randomUUID(),
              productId: product.id,
              delta: -qty,
              stockBefore: 0,
              stockAfter: 0,
              reason: 'RESERVATION',
              referenceId: resId,
              triggeredBy: cust.id,
              strategy: LockStrategy.REDIS_LUA,
              executionTimeUs: randInt(200, 800),
              isOversell: false,
              createdAt: orderTime
            })

            outboxList.push({
              id: randomUUID(),
              type: 'order.created',
              aggregateId: ordId,
              payload: {
                orderId: ordId,
                customerId: cust.id,
                merchantId,
                totalAmount: totalAmt
              } as unknown as Prisma.InputJsonValue,
              processed: true,
              processedAt: new Date(orderCreatedAt.getTime() + 5_000),
              createdAt: orderCreatedAt
            })

            paidCountByCp[cp.id] = (paidCountByCp[cp.id] ?? 0) + qty
            soldByProductId.set(
              product.id,
              (soldByProductId.get(product.id) ?? 0) + qty
            )
          }
        }
        totalOrders += numOrders
      }

      // Batch insert theo thứ tự FK
      await prisma.reservation.createMany({
        data: resList,
        skipDuplicates: true
      })
      await prisma.stockAllocation.createMany({
        data: saList,
        skipDuplicates: true
      })
      await prisma.order.createMany({ data: ordList, skipDuplicates: true })
      await prisma.orderItem.createMany({ data: oiList, skipDuplicates: true })
      await prisma.payment.createMany({ data: payList, skipDuplicates: true })
      await prisma.paymentWebhookLog.createMany({
        data: webhookList,
        skipDuplicates: true
      })
      await prisma.commissionLedger.createMany({
        data: clList,
        skipDuplicates: true
      })
      if (fulfOrderList.length)
        await prisma.fulfillmentOrder.createMany({
          data: fulfOrderList,
          skipDuplicates: true
        })
      if (trackList.length)
        await prisma.trackingEvent.createMany({
          data: trackList,
          skipDuplicates: true
        })
      if (auditList.length)
        await prisma.stockAuditLog.createMany({
          data: auditList,
          skipDuplicates: true
        })
      if (qcList.length)
        await prisma.qcCheckpoint.createMany({
          data: qcList,
          skipDuplicates: true
        })
      if (notifList.length)
        await prisma.notification.createMany({
          data: notifList,
          skipDuplicates: true
        })
      if (outboxList.length)
        await prisma.outboxEvent.createMany({
          data: outboxList,
          skipDuplicates: true
        })
      if (actionLogList.length)
        await prisma.userActionLog.createMany({
          data: actionLogList,
          skipDuplicates: true
        })

      await Promise.all(
        cpRows.map(cp => {
          const sold = paidCountByCp[cp.id] ?? 0
          return prisma.campaignProduct.update({
            where: { id: cp.id },
            data: { remainingQuantity: Math.max(0, cp.saleQuantity - sold) }
          })
        })
      )

      const cpForSnapshot = cpRows.map((cp, i) => ({
        id: cp.id,
        qty: products[tmpl.productOrder[i]].sale,
        saleQty: products[tmpl.productOrder[i]].qty
      }))
      await createSnapshots(
        campaign.id,
        cpForSnapshot,
        tmpl.start,
        distribEnd,
        orderTimesByCp
      )
      await createFunnelEvents(
        campaign.id,
        customers,
        ordList.length,
        tmpl.start,
        distribEnd
      )

      console.log(
        `  ✅ [${ci + 1}/9] "${tmpl.name}" [${tmpl.status}] — ${
          resList.length
        } reservations, ${ordList.length} orders`
      )
    }

    for (const [productId, sold] of soldByProductId.entries()) {
      await prisma.inventory.updateMany({
        where: { productId, warehouseId: 'default' },
        data: { quantity: { decrement: sold } }
      })
    }
    console.log(
      `✅ Inventory updated: ${soldByProductId.size} products decremented`
    )
  } // end campaign block

  // ── Orders cho ACTIVE campaign ─────────────────────────────────────────────
  console.log('\n' + '─'.repeat(65))
  console.log('🔧 Tìm ACTIVE campaigns và tạo orders...')

  const activeCampaigns = await prisma.campaign.findMany({
    where: { status: 'ACTIVE' },
    include: {
      campaignProducts: { include: { product: true } },
      merchant: true,
      commissionCategory: true
    }
  })

  let totalActiveOrders = 0
  for (const campaign of activeCampaigns) {
    if (campaign.campaignProducts.length === 0) {
      console.log(`  ⚠️  "${campaign.name}" không có sản phẩm, bỏ qua`)
      continue
    }
    const alreadyExists = await prisma.reservation.count({
      where: { campaignProduct: { campaignId: campaign.id } }
    })
    if (alreadyExists > 0) {
      console.log(
        `  ⚠️  "${campaign.name}" đã có ${alreadyExists} reservations, bỏ qua`
      )
      continue
    }
    const created = await seedOrdersForActiveCampaign({
      campaign,
      customers,
      adminId,
      numOrders: NUM_ACTIVE_ORDERS,
      usedGhnCodes
    })
    totalActiveOrders += created
    console.log(`  ✅ "${campaign.name}" — ${created} orders đầy đủ`)
  }

  if (activeCampaigns.length === 0) {
    console.log('  ⚠️  Không tìm thấy ACTIVE campaign. Chạy seed.ts trước!')
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log('\n' + '─'.repeat(65))
  console.log('🎉 Seed hoàn tất!\n')
  console.log(`  • 2 merchants: TechZone Vietnam + SmartHome Plus`)
  console.log(`  • ${NUM_CUSTOMERS} customers (tên thật, email Gmail)`)
  console.log(`  • 20 products (10 tech + 10 home)`)
  console.log(`  • 9 campaigns: 3 ENDED + 3 ACTIVE + 3 SCHEDULED`)
  console.log(`  • ${totalCPs} CampaignProducts`)
  console.log(
    `  • ~${totalOrders} orders lịch sử (full chain + GHN + Stripe + OutboxEvent)`
  )
  console.log(`  • ${totalActiveOrders} orders ACTIVE campaign`)
  console.log(`  • Analytics snapshots + FunnelEvent + UserActionLog`)
  console.log(`  • Thời gian: ${elapsed}s`)
  console.log('─'.repeat(65))
}

// ─── Orders cho ACTIVE campaign ───────────────────────────────────────────────
interface ActiveCampaignInput {
  campaign: {
    id: string
    merchantId: string
    commissionRate: { toNumber(): number } | number
    commissionCategoryId: string | null
    startTime: Date
    endTime: Date
    campaignProducts: Array<{
      id: string
      productId: string
      salePrice: { toNumber(): number } | number
      saleQuantity: number
      perUserLimit: number
      product: {
        originalPrice: { toNumber(): number } | number
        merchantId: string
      }
    }>
    merchant: { id: string }
  }
  customers: Array<{ id: string; fullName: string }>
  adminId: string | null
  numOrders: number
  usedGhnCodes: Set<string>
}

async function seedOrdersForActiveCampaign(
  input: ActiveCampaignInput
): Promise<number> {
  const { campaign, customers, adminId, numOrders, usedGhnCodes } = input
  const commissionRate =
    typeof campaign.commissionRate === 'number'
      ? campaign.commissionRate
      : campaign.commissionRate.toNumber()
  const cps = campaign.campaignProducts
  const distribEnd = new Date(Math.min(Date.now(), campaign.endTime.getTime()))

  const resList: Prisma.ReservationCreateManyInput[] = []
  const saList: Prisma.StockAllocationCreateManyInput[] = []
  const ordList: Prisma.OrderCreateManyInput[] = []
  const oiList: Prisma.OrderItemCreateManyInput[] = []
  const payList: Prisma.PaymentCreateManyInput[] = []
  const webhookList: Prisma.PaymentWebhookLogCreateManyInput[] = []
  const clList: Prisma.CommissionLedgerCreateManyInput[] = []
  const fulfList: Prisma.FulfillmentOrderCreateManyInput[] = []
  const trackList: Prisma.TrackingEventCreateManyInput[] = []
  const qcList: Prisma.QcCheckpointCreateManyInput[] = []
  const notifList: Prisma.NotificationCreateManyInput[] = []
  const auditList: Prisma.StockAuditLogCreateManyInput[] = []
  const outboxList: Prisma.OutboxEventCreateManyInput[] = []
  const actionLogList: Prisma.UserActionLogCreateManyInput[] = []
  const paidCountByCp: Record<string, number> = {}
  const soldByProductId = new Map<string, number>()
  const orderTimesByCp = new Map<string, Date[]>()

  for (let i = 0; i < numOrders; i++) {
    const cp = cps[i % cps.length]
    const cust = customers[i % customers.length]
    const salePrice =
      typeof cp.salePrice === 'number' ? cp.salePrice : cp.salePrice.toNumber()
    const origPrice =
      typeof cp.product.originalPrice === 'number'
        ? cp.product.originalPrice
        : cp.product.originalPrice.toNumber()

    const orderTime = randDate(campaign.startTime, distribEnd)
    if (!orderTimesByCp.has(cp.id)) orderTimesByCp.set(cp.id, [])
    orderTimesByCp.get(cp.id)!.push(orderTime)

    const ageHours = (Date.now() - orderTime.getTime()) / 3_600_000
    const orderStatus: 'CONFIRMED' | 'SHIPPING' | 'DONE' =
      ageHours > 12 ? 'DONE' : ageHours > 4 ? 'SHIPPING' : 'CONFIRMED'
    const fulfillStatus: FulfillmentStatus =
      orderStatus === 'DONE'
        ? FulfillmentStatus.DELIVERED
        : orderStatus === 'SHIPPING'
        ? FulfillmentStatus.IN_TRANSIT
        : FulfillmentStatus.AWAITING

    const resId = randomUUID()
    const ordId = randomUUID()
    const payId = randomUUID()
    const fulfId = randomUUID()
    const qty = 1
    const totalAmt = salePrice * qty
    const commAmt = Math.round(totalAmt * commissionRate * 100) / 100
    const netAmt = Math.round((totalAmt - commAmt) * 100) / 100
    const addrIdx = (i + 500000) % ADDRESS_POOL.length
    const shippingAddr = buildShippingAddress(addrIdx, cust.fullName)
    const txId = stripeSessionId()
    const orderCreatedAt = new Date(orderTime.getTime() + 60_000)

    resList.push({
      id: resId,
      customerId: cust.id,
      campaignProductId: cp.id,
      quantity: qty,
      status: 'PAID',
      idempotencyKey: `${cp.id}:${cust.id}:active:${i}`,
      shippingAddress: shippingAddr,
      expiredAt: new Date(campaign.startTime.getTime() + 15 * 60_000),
      createdAt: orderTime
    })

    saList.push({
      id: randomUUID(),
      campaignProductId: cp.id,
      reservationId: resId,
      quantity: qty,
      createdAt: orderTime
    })

    actionLogList.push({
      id: randomUUID(),
      userId: cust.id,
      ip: `${randInt(1, 254)}.${randInt(1, 254)}.${randInt(1, 254)}.${randInt(
        1,
        254
      )}`,
      action: 'purchase',
      targetId: campaign.id,
      createdAt: new Date(orderTime.getTime() - 30_000)
    })

    ordList.push({
      id: ordId,
      customerId: cust.id,
      merchantId: campaign.merchantId,
      reservationId: resId,
      idempotencyKey: payId,
      status: orderStatus,
      totalAmount: totalAmt,
      shippingAddress: shippingAddr,
      createdAt: orderCreatedAt
    })

    oiList.push({
      id: randomUUID(),
      orderId: ordId,
      productId: cp.productId,
      quantity: qty,
      unitPrice: salePrice,
      originalPrice: origPrice,
      createdAt: orderCreatedAt
    })

    payList.push({
      id: payId,
      reservationId: resId,
      orderId: ordId,
      amount: totalAmt,
      method: 'STRIPE',
      status: 'SUCCESS',
      transactionId: txId,
      idempotencyKey: `checkout:${resId}`,
      paidAt: new Date(orderTime.getTime() + 120_000),
      createdAt: new Date(orderTime.getTime() + 90_000)
    })

    webhookList.push({
      id: randomUUID(),
      paymentId: payId,
      provider: 'stripe',
      transactionId: txId,
      payload: {
        id: `evt_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
        object: 'event',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: txId,
            amount_total: totalAmt,
            currency: 'vnd',
            payment_status: 'paid',
            status: 'complete',
            metadata: { reservationId: resId }
          }
        }
      } as unknown as Prisma.InputJsonValue,
      processed: true,
      processedAt: new Date(orderTime.getTime() + 125_000),
      createdAt: new Date(orderTime.getTime() + 120_000)
    })

    clList.push({
      id: randomUUID(),
      orderId: ordId,
      paymentId: payId,
      campaignId: campaign.id,
      merchantId: campaign.merchantId,
      commissionCategoryId: campaign.commissionCategoryId,
      commissionRate,
      grossAmount: totalAmt,
      commissionAmount: commAmt,
      netAmount: netAmt,
      createdAt: new Date(orderTime.getTime() + 120_000)
    })

    const ghnCode = ghnOrderCode(usedGhnCodes)
    const labelBookedAt =
      orderStatus !== 'CONFIRMED'
        ? new Date(orderCreatedAt.getTime() + 30 * 60_000)
        : null
    const shippedAt =
      orderStatus === 'SHIPPING' || orderStatus === 'DONE'
        ? new Date(orderCreatedAt.getTime() + 2 * 3_600_000)
        : null
    const deliveredAt =
      orderStatus === 'DONE'
        ? new Date(orderCreatedAt.getTime() + 24 * 3_600_000)
        : null

    fulfList.push({
      id: fulfId,
      orderId: ordId,
      carrierId: null,
      ghnOrderCode: ghnCode,
      ghnServiceId: '2',
      labelUrl: labelBookedAt
        ? `https://tracking.ghn.dev/?order_code=${ghnCode}`
        : null,
      trackingUrl: labelBookedAt
        ? `https://tracking.ghn.dev/?order_code=${ghnCode}`
        : null,
      trackingNumber: labelBookedAt ? ghnCode : null,
      fulfillStatus,
      addressValidated: true,
      labelCostCents: labelBookedAt ? randInt(22000, 80000) : null,
      normalizedAddress: normalizedAddress(
        addrIdx,
        cust.fullName
      ) as unknown as Prisma.InputJsonValue,
      labelBookedAt,
      shippedAt,
      deliveredAt,
      createdAt: orderCreatedAt
    })

    if (shippedAt) {
      trackList.push({
        id: randomUUID(),
        fulfillmentId: fulfId,
        carrierStatus: 'in_transit',
        description: 'Đơn hàng đang vận chuyển',
        location: ADDRESS_POOL[addrIdx % ADDRESS_POOL.length].to_province_name,
        occurredAt: shippedAt,
        sourcePayload: ghnWebhookPayload(
          ghnCode,
          'in_transit',
          shippedAt
        ) as unknown as Prisma.InputJsonValue,
        createdAt: shippedAt
      })
    }
    if (deliveredAt) {
      trackList.push({
        id: randomUUID(),
        fulfillmentId: fulfId,
        carrierStatus: 'delivered',
        description: 'Giao hàng thành công',
        location: `${
          ADDRESS_POOL[addrIdx % ADDRESS_POOL.length].to_district_name
        }, ${ADDRESS_POOL[addrIdx % ADDRESS_POOL.length].to_province_name}`,
        occurredAt: deliveredAt,
        sourcePayload: ghnWebhookPayload(
          ghnCode,
          'delivered',
          deliveredAt
        ) as unknown as Prisma.InputJsonValue,
        createdAt: deliveredAt
      })
    }

    if (adminId) {
      qcList.push({
        id: randomUUID(),
        orderId: ordId,
        inspectorId: adminId,
        status: QcStatus.PASSED,
        checklist: [
          { key: 'item_count', label: 'Số lượng sản phẩm đúng', passed: true },
          { key: 'packaging', label: 'Đóng gói nguyên vẹn', passed: true },
          {
            key: 'label_match',
            label: 'Label khớp với đơn hàng',
            passed: true
          },
          {
            key: 'no_damage',
            label: 'Sản phẩm không bị hỏng hóc',
            passed: true
          }
        ] as unknown as Prisma.InputJsonValue,
        photoUrls: [],
        passedAt: new Date(orderCreatedAt.getTime() + 20 * 60_000),
        createdAt: new Date(orderCreatedAt.getTime() + 15 * 60_000)
      })
    }

    notifList.push({
      id: randomUUID(),
      userId: cust.id,
      type: 'ORDER_CONFIRMED',
      title: 'Đặt hàng thành công!',
      message: 'Đơn hàng của bạn đã được xác nhận và đang được xử lý.',
      read: Math.random() > 0.4,
      createdAt: new Date(orderCreatedAt.getTime() + 2_000)
    })
    if (deliveredAt) {
      notifList.push({
        id: randomUUID(),
        userId: cust.id,
        type: 'ORDER_DELIVERED',
        title: 'Đơn hàng đã giao thành công',
        message: `Đơn hàng ${ordId} đã được giao. Cảm ơn bạn đã mua sắm!`,
        read: Math.random() > 0.2,
        createdAt: new Date(deliveredAt.getTime() + 5_000)
      })
    }

    auditList.push({
      id: randomUUID(),
      productId: cp.productId,
      delta: -qty,
      stockBefore: 0,
      stockAfter: 0,
      reason: 'RESERVATION',
      referenceId: resId,
      triggeredBy: cust.id,
      strategy: LockStrategy.REDIS_LUA,
      executionTimeUs: randInt(200, 800),
      isOversell: false,
      createdAt: orderTime
    })

    outboxList.push({
      id: randomUUID(),
      type: 'order.created',
      aggregateId: ordId,
      payload: {
        orderId: ordId,
        customerId: cust.id,
        merchantId: campaign.merchantId,
        totalAmount: totalAmt
      } as unknown as Prisma.InputJsonValue,
      processed: true,
      processedAt: new Date(orderCreatedAt.getTime() + 5_000),
      createdAt: orderCreatedAt
    })

    paidCountByCp[cp.id] = (paidCountByCp[cp.id] ?? 0) + qty
    soldByProductId.set(
      cp.productId,
      (soldByProductId.get(cp.productId) ?? 0) + qty
    )
  }

  await prisma.reservation.createMany({ data: resList, skipDuplicates: true })
  await prisma.stockAllocation.createMany({
    data: saList,
    skipDuplicates: true
  })
  await prisma.order.createMany({ data: ordList, skipDuplicates: true })
  await prisma.orderItem.createMany({ data: oiList, skipDuplicates: true })
  await prisma.payment.createMany({ data: payList, skipDuplicates: true })
  await prisma.paymentWebhookLog.createMany({
    data: webhookList,
    skipDuplicates: true
  })
  await prisma.commissionLedger.createMany({
    data: clList,
    skipDuplicates: true
  })
  await prisma.fulfillmentOrder.createMany({
    data: fulfList,
    skipDuplicates: true
  })
  if (trackList.length)
    await prisma.trackingEvent.createMany({
      data: trackList,
      skipDuplicates: true
    })
  if (qcList.length)
    await prisma.qcCheckpoint.createMany({ data: qcList, skipDuplicates: true })
  await prisma.notification.createMany({
    data: notifList,
    skipDuplicates: true
  })
  await prisma.stockAuditLog.createMany({
    data: auditList,
    skipDuplicates: true
  })
  await prisma.outboxEvent.createMany({
    data: outboxList,
    skipDuplicates: true
  })
  await prisma.userActionLog.createMany({
    data: actionLogList,
    skipDuplicates: true
  })

  await Promise.all(
    cps.map(cp => {
      const sold = paidCountByCp[cp.id] ?? 0
      return prisma.campaignProduct.update({
        where: { id: cp.id },
        data: { remainingQuantity: Math.max(0, cp.saleQuantity - sold) }
      })
    })
  )

  for (const [productId, sold] of soldByProductId.entries()) {
    await prisma.inventory.updateMany({
      where: { productId, warehouseId: 'default' },
      data: { quantity: { decrement: sold } }
    })
  }

  const cpForSnapshot = cps.map(cp => ({
    id: cp.id,
    qty:
      typeof cp.salePrice === 'number' ? cp.salePrice : cp.salePrice.toNumber(),
    saleQty: cp.saleQuantity
  }))
  await createSnapshots(
    campaign.id,
    cpForSnapshot,
    campaign.startTime,
    distribEnd,
    orderTimesByCp
  )
  await createFunnelEvents(
    campaign.id,
    customers,
    ordList.length,
    campaign.startTime,
    distribEnd
  )

  return ordList.length
}

main()
  .catch(e => {
    console.error('❌ Seed thất bại:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
