/**
 * Seed script — dữ liệu giả lập cho môi trường dev/test
 *
 * Tài khoản test:
 *   Admin:     admin@flashsale.vn          / Admin@123456
 *   Customer:  customer1@test.vn           / Test@123456
 *              customer2@test.vn           / Test@123456
 *              customer3@test.vn           / Test@123456
 *   Merchant:  merchant1@techviet.vn       / Test@123456
 *              merchant2@fashionhub.vn     / Test@123456
 *              merchant3@homelife.vn       / Test@123456
 *
 * Lưu ý: emailVerified = true → bypass OTP hoàn toàn
 *
 * Chạy: cd flashsale-backend && pnpm seed
 */

import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

// ─── Constants ───────────────────────────────────────────────────────────────

const BCRYPT_SALT = 10
const CUSTOMER_PASSWORD = 'Test@123456'
const ADMIN_PASSWORD = 'Admin@123456'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Ảnh Unsplash placeholder cho từng loại sản phẩm
const PRODUCT_IMAGE_URLS: Record<string, string> = {
  iphone:
    'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&q=80',
  samsung_phone:
    'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=800&q=80',
  macbook:
    'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80',
  ipad: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800&q=80',
  airpods:
    'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&q=80',
  headphone:
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80',
  tv: 'https://images.unsplash.com/photo-1567690187548-f07b1d7bf5a9?w=800&q=80',
  ps5: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=800&q=80',
  apple_watch:
    'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800&q=80',
  xiaomi:
    'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=800&q=80',
  drone:
    'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=800&q=80',
  gopro:
    'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&q=80',
  nintendo:
    'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=800&q=80',
  mouse:
    'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800&q=80',
  leather_jacket:
    'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&q=80',
  handbag:
    'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&q=80',
  oxford_shoes:
    'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&q=80',
  dress:
    'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&q=80',
  jeans: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=800&q=80',
  polo_shirt:
    'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=800&q=80',
  sneakers:
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80',
  backpack:
    'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
  watch:
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80',
  sunglasses:
    'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800&q=80',
  belt: 'https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=800&q=80',
  boots:
    'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=800&q=80',
  sweater:
    'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=800&q=80',
  air_purifier:
    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&q=80',
  robot_vacuum:
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
  coffee_machine:
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80',
  air_fryer:
    'https://images.unsplash.com/photo-1585515320310-259814833e62?w=800&q=80',
  water_filter:
    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80',
  smart_light:
    'https://images.unsplash.com/photo-1558002038-1055907df827?w=800&q=80',
  speaker:
    'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80',
  blender:
    'https://images.unsplash.com/photo-1585515320310-259814833e62?w=800&q=80',
  rice_cooker:
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80',
  dishwasher:
    'https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=800&q=80',
  ac: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&q=80',
  washing_machine:
    'https://images.unsplash.com/photo-1604335399105-a0c585fd81a1?w=800&q=80',
  refrigerator:
    'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800&q=80'
}

function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

function daysAgo(days: number): Date {
  return daysFromNow(-days)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Bắt đầu seed dữ liệu...\n')

  // Xóa dữ liệu cũ theo thứ tự FK (leaf → root)
  await cleanDatabase()

  const passwordHash = await bcrypt.hash(CUSTOMER_PASSWORD, BCRYPT_SALT)
  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_SALT)

  // ── 1. Admin ──────────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      email: 'admin@flashsale.vn',
      fullName: 'Super Admin',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      emailVerified: true,
      status: 'ACTIVE'
    }
  })
  console.log(`✅ Admin: ${admin.email}`)

  // ── 2. Customers ──────────────────────────────────────────────────────────
  const customers = await Promise.all([
    prisma.user.create({
      data: {
        email: 'customer1@test.vn',
        fullName: 'Nguyễn Văn An',
        passwordHash,
        role: 'CUSTOMER',
        emailVerified: true,
        status: 'ACTIVE',
        customerProfile: {
          create: {
            phone: '0901234567',
            defaultAddress: '123 Nguyễn Huệ, Quận 1, TP.HCM'
          }
        }
      }
    }),
    prisma.user.create({
      data: {
        email: 'customer2@test.vn',
        fullName: 'Trần Thị Bích',
        passwordHash,
        role: 'CUSTOMER',
        emailVerified: true,
        status: 'ACTIVE',
        customerProfile: {
          create: {
            phone: '0912345678',
            defaultAddress: '45 Trần Duy Hưng, Cầu Giấy, Hà Nội'
          }
        }
      }
    }),
    prisma.user.create({
      data: {
        email: 'customer3@test.vn',
        fullName: 'Lê Minh Tuân',
        passwordHash,
        role: 'CUSTOMER',
        emailVerified: true,
        status: 'ACTIVE',
        customerProfile: {
          create: {
            phone: '0923456789',
            defaultAddress: '78 Hải Phòng, Thanh Khê, Đà Nẵng'
          }
        }
      }
    })
  ])
  console.log(`✅ Customers: ${customers.map(c => c.email).join(', ')}`)

  // ── 3. Merchants ──────────────────────────────────────────────────────────
  const merchantUser1 = await prisma.user.create({
    data: {
      email: 'merchant1@techviet.vn',
      fullName: 'Trương Quốc Hùng',
      passwordHash,
      role: 'MERCHANT',
      emailVerified: true,
      status: 'ACTIVE'
    }
  })
  const merchant1 = await prisma.merchantProfile.create({
    data: {
      userId: merchantUser1.id,
      businessName: 'TechViet Store',
      taxCode: '0312345678',
      description:
        'Chuyên cung cấp thiết bị điện tử, điện thoại, laptop chính hãng với giá tốt nhất thị trường.',
      phone: '0281234567',
      address: '200 Võ Văn Ngân, Thủ Đức, TP.HCM',
      kycStatus: 'APPROVED',
      approvedAt: daysAgo(30),
      approvedBy: admin.id
    }
  })

  const merchantUser2 = await prisma.user.create({
    data: {
      email: 'merchant2@fashionhub.vn',
      fullName: 'Phạm Thị Lan Anh',
      passwordHash,
      role: 'MERCHANT',
      emailVerified: true,
      status: 'ACTIVE'
    }
  })
  const merchant2 = await prisma.merchantProfile.create({
    data: {
      userId: merchantUser2.id,
      businessName: 'Fashion Hub',
      taxCode: '0387654321',
      description:
        'Thời trang cao cấp chính hãng: giày dép, túi xách, quần áo nhập khẩu trực tiếp từ Europe & USA.',
      phone: '0241234567',
      address: '15 Hàng Bài, Hoàn Kiếm, Hà Nội',
      kycStatus: 'APPROVED',
      approvedAt: daysAgo(20),
      approvedBy: admin.id
    }
  })

  const merchantUser3 = await prisma.user.create({
    data: {
      email: 'merchant3@homelife.vn',
      fullName: 'Ngô Thanh Sơn',
      passwordHash,
      role: 'MERCHANT',
      emailVerified: true,
      status: 'ACTIVE'
    }
  })
  const merchant3 = await prisma.merchantProfile.create({
    data: {
      userId: merchantUser3.id,
      businessName: 'HomeLife Vietnam',
      taxCode: '0398765432',
      description:
        'Thiết bị gia dụng cao cấp: máy lọc không khí, robot hút bụi, đồ gia dụng thông minh.',
      phone: '02361234567',
      address: '33 Nguyễn Chí Thanh, Hải Châu, Đà Nẵng',
      kycStatus: 'APPROVED',
      approvedAt: daysAgo(15),
      approvedBy: admin.id
    }
  })

  console.log(`✅ Merchants: TechViet Store, Fashion Hub, HomeLife Vietnam`)

  // ── 4. Commission Categories ───────────────────────────────────────────────
  const [catElec, catFashion, catHome] = await Promise.all([
    prisma.commissionCategory.upsert({
      where: { code: 'ELECTRONICS' },
      update: {},
      create: {
        code: 'ELECTRONICS',
        name: 'Điện tử - Công nghệ',
        description: 'Điện thoại, laptop, máy tính bảng, phụ kiện điện tử',
        defaultRate: 0.05,
        isActive: true,
        sortOrder: 1
      }
    }),
    prisma.commissionCategory.upsert({
      where: { code: 'FASHION' },
      update: {},
      create: {
        code: 'FASHION',
        name: 'Thời trang - Phụ kiện',
        description: 'Quần áo, giày dép, túi xách, đồng hồ',
        defaultRate: 0.08,
        isActive: true,
        sortOrder: 2
      }
    }),
    prisma.commissionCategory.upsert({
      where: { code: 'HOME_APPLIANCE' },
      update: {},
      create: {
        code: 'HOME_APPLIANCE',
        name: 'Đồ gia dụng',
        description:
          'Máy lọc không khí, robot hút bụi, thiết bị nhà thông minh',
        defaultRate: 0.06,
        isActive: true,
        sortOrder: 3
      }
    })
  ])

  // ── 5. Products — TechViet (14 sản phẩm) ─────────────────────────────────
  const productData1 = [
    {
      name: 'iPhone 15 Pro Max 256GB',
      desc: 'Chip A17 Pro, camera 48MP, Dynamic Island, màn hình Super Retina XDR 6.7"',
      price: 34990000,
      img: 'iphone',
      inv: 200
    },
    {
      name: 'Samsung Galaxy S24 Ultra',
      desc: 'Snapdragon 8 Gen 3, camera 200MP, bút S Pen, màn hình Dynamic AMOLED 6.8"',
      price: 31990000,
      img: 'samsung_phone',
      inv: 150
    },
    {
      name: 'MacBook Air M3 15"',
      desc: 'Chip Apple M3 8 nhân, RAM 16GB, SSD 512GB, màn hình Liquid Retina 15.3"',
      price: 37990000,
      img: 'macbook',
      inv: 80
    },
    {
      name: 'iPad Pro M4 12.9"',
      desc: 'Chip M4 thế hệ mới, màn hình Liquid Retina XDR, Face ID, Wi-Fi 6E',
      price: 28990000,
      img: 'ipad',
      inv: 100
    },
    {
      name: 'AirPods Pro (2nd Gen)',
      desc: 'Chống ồn chủ động H2, Spatial Audio, kháng nước IP54, hộp sạc MagSafe',
      price: 6290000,
      img: 'airpods',
      inv: 300
    },
    {
      name: 'Sony WH-1000XM5',
      desc: 'Chống ồn hàng đầu thế giới, 30h pin, đàm thoại hands-free cực rõ',
      price: 8490000,
      img: 'headphone',
      inv: 150
    },
    {
      name: 'Samsung Neo QLED 4K 55"',
      desc: 'Công nghệ Mini LED, Quantum HDR 32x, 120Hz, Smart TV Tizen',
      price: 22990000,
      img: 'tv',
      inv: 50
    },
    {
      name: 'PlayStation 5 Standard',
      desc: 'SSD tốc độ cao, ray tracing, 4K@120fps, DualSense haptic feedback',
      price: 13990000,
      img: 'ps5',
      inv: 60
    },
    {
      name: 'Apple Watch Series 9 45mm',
      desc: 'Chip S9, Double Tap gesture, Always-On Retina, GPS + Cellular',
      price: 11490000,
      img: 'apple_watch',
      inv: 120
    },
    {
      name: 'Xiaomi 14 Ultra',
      desc: 'Snapdragon 8 Gen 3, camera Leica Summilux, sạc nhanh 90W HyperCharge',
      price: 22990000,
      img: 'xiaomi',
      inv: 100
    },
    {
      name: 'DJI Mini 4 Pro',
      desc: 'Cảm biến 1/1.3", 4K/60fps, OcuSync 4.0 video truyền 20km, bay 34 phút',
      price: 19490000,
      img: 'drone',
      inv: 40
    },
    {
      name: 'GoPro HERO12 Black',
      desc: '5.3K video, HyperSmooth 6.0, chống nước 10m, lens góc rộng 177°',
      price: 10490000,
      img: 'gopro',
      inv: 80
    },
    {
      name: 'Nintendo Switch OLED',
      desc: 'Màn hình OLED 7", dock kết nối LAN, loa nâng cấp, 64GB bộ nhớ trong',
      price: 8490000,
      img: 'nintendo',
      inv: 90
    },
    {
      name: 'Logitech MX Master 3S',
      desc: 'Scroll 8000 DPI, MagSpeed từ tính, Bluetooth + USB, dành cho dân văn phòng',
      price: 2290000,
      img: 'mouse',
      inv: 200
    }
  ]

  // ── Products — Fashion Hub (13 sản phẩm) ─────────────────────────────────
  const productData2 = [
    {
      name: 'Áo khoác da bò thật Italy',
      desc: 'Da bò Nappa nhập Italy, lớp lót cashmere, cổ bẻ, khóa kéo YKK',
      price: 4590000,
      img: 'leather_jacket',
      inv: 80
    },
    {
      name: 'Túi xách Leather Tote',
      desc: 'Da thật 100%, khâu tay, khóa từ mạ vàng, phụ kiện Brass chống rỉ',
      price: 3890000,
      img: 'handbag',
      inv: 60
    },
    {
      name: 'Giày Oxford Da Bê Nam',
      desc: 'Mũi nhọn cổ điển, đế cao su, da lộn mịn, kiểu dáng Brogue thanh lịch',
      price: 2490000,
      img: 'oxford_shoes',
      inv: 100
    },
    {
      name: 'Đầm Dạ Tiệc Sequin',
      desc: 'Vải sequin cao cấp, thiết kế ôm body, cổ V sâu, tay lỡ sang trọng',
      price: 2890000,
      img: 'dress',
      inv: 70
    },
    {
      name: "Quần Jeans Levi's 501 Original",
      desc: 'Denim 100% cotton, fit straight cổ điển, stonewash, made in USA',
      price: 1690000,
      img: 'jeans',
      inv: 150
    },
    {
      name: 'Áo Polo Ralph Lauren Classic Fit',
      desc: 'Cotton piqué thở tốt, logo thêu tay, cổ bẻ 3 khuy, màu sắc đa dạng',
      price: 1890000,
      img: 'polo_shirt',
      inv: 200
    },
    {
      name: 'Nike Air Max 270 React',
      desc: 'Đế bong bóng Air 270 độ, foam React nhẹ đàn hồi, thiết kế retro 90s',
      price: 3290000,
      img: 'sneakers',
      inv: 120
    },
    {
      name: 'Balo The North Face Recon',
      desc: 'Khung lưng FlexVent, túi laptop 15", chống nước, thể tích 30L',
      price: 2690000,
      img: 'backpack',
      inv: 90
    },
    {
      name: 'Đồng Hồ Casio G-Shock GA2100',
      desc: 'Chống sốc mạnh, chống nước 200m, pin 2 năm, thiết kế Carbon Core Guard',
      price: 3990000,
      img: 'watch',
      inv: 100
    },
    {
      name: 'Kính Mát Rayban Aviator Classic',
      desc: 'Gọng kim loại không gỉ, tròng kính chống UV400, mắt hình giọt nước iconic',
      price: 3490000,
      img: 'sunglasses',
      inv: 80
    },
    {
      name: 'Thắt Lưng Da Thật Saffiano',
      desc: 'Da Saffiano nhập Ý, bề mặt dập vân đặc trưng, khóa inox mờ thời thượng',
      price: 1290000,
      img: 'belt',
      inv: 120
    },
    {
      name: 'Chelsea Boots Da Lộn',
      desc: 'Da lộn Suede nhập khẩu, đế Goodyear welt, chiều cao gót 5cm, kéo dây đàn hồi',
      price: 3890000,
      img: 'boots',
      inv: 70
    },
    {
      name: 'Áo Len Cashmere Merino',
      desc: 'Lông cừu Merino 100%, mềm mịn như cashmere, cổ tròn, dày dặn chống lạnh',
      price: 2990000,
      img: 'sweater',
      inv: 100
    }
  ]

  // ── Products — HomeLife (13 sản phẩm) ─────────────────────────────────────
  const productData3 = [
    {
      name: 'Máy Lọc Không Khí Dyson Purifier Hot+Cool',
      desc: 'Lọc 99.97% hạt bụi 0.3µm, cảm biến CO₂ tự động, sưởi + làm mát, kết nối app',
      price: 18490000,
      img: 'air_purifier',
      inv: 40
    },
    {
      name: 'Robot Hút Bụi iRobot Roomba j7+',
      desc: 'Camera AI nhận diện vật cản, tự đổ rác, lập bản đồ thông minh, kết nối Alexa',
      price: 17990000,
      img: 'robot_vacuum',
      inv: 35
    },
    {
      name: 'Máy Pha Cà Phê DeLonghi Dinamica Plus',
      desc: 'Tự động xay + pha, 13 chế độ cà phê, màn hình cảm ứng TFT, kết nối app',
      price: 24990000,
      img: 'coffee_machine',
      inv: 30
    },
    {
      name: 'Nồi Chiên Không Dầu Philips XXL 7.2L',
      desc: 'Công nghệ Rapid Air mới, 7.2L dung tích, preset 16 món, kết nối NutriU app',
      price: 4890000,
      img: 'air_fryer',
      inv: 80
    },
    {
      name: 'Máy Lọc Nước RO Kangaroo Hydrogen Plus',
      desc: '9 lõi lọc, bổ sung Hydrogen, loại bỏ 99.99% vi khuẩn, dung tích 10L/giờ',
      price: 7490000,
      img: 'water_filter',
      inv: 60
    },
    {
      name: 'Đèn LED Thông Minh Philips Hue Starter Kit',
      desc: 'Bộ 3 bóng A19, 16 triệu màu, điều khiển giọng nói, tích hợp Zigbee hub',
      price: 2890000,
      img: 'smart_light',
      inv: 100
    },
    {
      name: 'Loa Bluetooth JBL Charge 5',
      desc: 'Âm thanh 40W mạnh mẽ, pin 20h, chống nước IP67, sạc thiết bị khác qua USB',
      price: 3490000,
      img: 'speaker',
      inv: 90
    },
    {
      name: 'Máy Xay Sinh Tố Vitamix E310 Explorian',
      desc: 'Motor 2.0HP, tốc độ 10 mức + Pulse, 1.4L thép không gỉ, bảo hành 5 năm',
      price: 14990000,
      img: 'blender',
      inv: 25
    },
    {
      name: 'Nồi Cơm Điện Cao Tần Zojirushi NW-LAQ18',
      desc: 'IH cao tần 8 lớp áp lực, nấu cơm Neuro Fuzzy AI, dung tích 1.8L',
      price: 8490000,
      img: 'rice_cooker',
      inv: 50
    },
    {
      name: 'Máy Rửa Bát Bosch SMS6ZCI42E',
      desc: '14 bộ chén, 8 chương trình, sấy Perfect Dry zeolith, tiêu thụ nước 9.5L/lần',
      price: 28990000,
      img: 'dishwasher',
      inv: 20
    },
    {
      name: 'Điều Hòa Daikin Inverter 2.0HP FTKB50XVMV',
      desc: 'Inverter tiết kiệm điện, cảm biến con người, tự làm sạch màng lọc, âm 19dB',
      price: 26990000,
      img: 'ac',
      inv: 30
    },
    {
      name: 'Máy Giặt LG AI DD 10kg FV1410S4W',
      desc: 'Động cơ DD AI nhận biết vải, giặt hơi nước TurboWash 360°, inverter tiết kiệm điện',
      price: 19490000,
      img: 'washing_machine',
      inv: 25
    },
    {
      name: 'Tủ Lạnh Samsung French Door 602L',
      desc: 'Family Hub màn hình 21.5", SpaceMax Technology, ngăn đông linh hoạt, Wi-Fi',
      price: 46990000,
      img: 'refrigerator',
      inv: 15
    }
  ]

  // Tạo products và inventory song song cho từng merchant
  const [products1, products2, products3] = await Promise.all([
    createProducts(merchant1.id, productData1),
    createProducts(merchant2.id, productData2),
    createProducts(merchant3.id, productData3)
  ])

  const allProductCount = products1.length + products2.length + products3.length
  console.log(
    `✅ Tổng sản phẩm: ${allProductCount} (TechViet: ${products1.length}, Fashion Hub: ${products2.length}, HomeLife: ${products3.length})`
  )

  // ── 6. Campaigns (10 chiến dịch) ──────────────────────────────────────────

  // Campaign 1 — ACTIVE: Flash Sale Điện thoại Flagship (TechViet)
  const campaign1 = await createCampaign({
    merchantId: merchant1.id,
    commissionCategoryId: catElec.id,
    name: 'Flash Sale Flagship Tháng 4',
    description:
      'Ưu đãi lớn nhất năm cho các dòng điện thoại flagship: iPhone 15 Pro Max, Samsung S24 Ultra và Xiaomi 14 Ultra. Giảm đến 40% - số lượng cực kỳ có hạn!',
    status: 'ACTIVE',
    startTime: daysAgo(2),
    endTime: daysFromNow(5),
    commissionRate: 0.05,
    approvedBy: admin.id
  })
  await createCampaignProducts(campaign1.id, [
    {
      productId: products1[0].id,
      salePrice: 22990000,
      saleQuantity: 50,
      perUserLimit: 1
    }, // iPhone
    {
      productId: products1[1].id,
      salePrice: 19990000,
      saleQuantity: 40,
      perUserLimit: 1
    }, // Samsung
    {
      productId: products1[9].id,
      salePrice: 13990000,
      saleQuantity: 30,
      perUserLimit: 1
    } // Xiaomi
  ])

  // Campaign 2 — ACTIVE: Flash Sale Đồ gia dụng (HomeLife)
  const campaign2 = await createCampaign({
    merchantId: merchant3.id,
    commissionCategoryId: catHome.id,
    name: 'Smart Home Deal - Tuần Lễ Vàng',
    description:
      'Sắm đồ gia dụng thông minh cho ngôi nhà hiện đại. Robot hút bụi, máy lọc không khí, đèn LED thông minh giảm đến 35%. Mua ngay kẻo hết!',
    status: 'ACTIVE',
    startTime: daysAgo(1),
    endTime: daysFromNow(3),
    commissionRate: 0.06,
    approvedBy: admin.id
  })
  await createCampaignProducts(campaign2.id, [
    {
      productId: products3[0].id,
      salePrice: 12990000,
      saleQuantity: 20,
      perUserLimit: 1
    }, // Air purifier Dyson
    {
      productId: products3[1].id,
      salePrice: 11990000,
      saleQuantity: 15,
      perUserLimit: 1
    }, // Robot Roomba
    {
      productId: products3[5].id,
      salePrice: 1890000,
      saleQuantity: 50,
      perUserLimit: 2
    }, // Smart light
    {
      productId: products3[6].id,
      salePrice: 2290000,
      saleQuantity: 40,
      perUserLimit: 2
    } // JBL Speaker
  ])

  // Campaign 3 — SCHEDULED: Back to School (TechViet)
  const campaign3 = await createCampaign({
    merchantId: merchant1.id,
    commissionCategoryId: catElec.id,
    name: 'Back To School - MacBook & iPad',
    description:
      'Mùa tựu trường với deal cực hot: MacBook Air M3 và iPad Pro M4 giảm giá đặc biệt dành cho sinh viên và học sinh. Kèm phần mềm bản quyền miễn phí!',
    status: 'SCHEDULED',
    startTime: daysFromNow(3),
    endTime: daysFromNow(6),
    commissionRate: 0.05,
    approvedBy: admin.id
  })
  await createCampaignProducts(campaign3.id, [
    {
      productId: products1[2].id,
      salePrice: 25990000,
      saleQuantity: 30,
      perUserLimit: 1
    }, // MacBook
    {
      productId: products1[3].id,
      salePrice: 18990000,
      saleQuantity: 30,
      perUserLimit: 1
    }, // iPad
    {
      productId: products1[4].id,
      salePrice: 3990000,
      saleQuantity: 80,
      perUserLimit: 2
    } // AirPods
  ])

  // Campaign 4 — SCHEDULED: Thời Trang Thu Đông (Fashion Hub)
  const campaign4 = await createCampaign({
    merchantId: merchant2.id,
    commissionCategoryId: catFashion.id,
    name: 'Thu Đông Sale - Áo Khoác & Boots',
    description:
      'Bộ sưu tập thu đông chính hãng: áo khoác da Ý, boots Chelsea nhập khẩu, áo len Cashmere Merino. Giảm đến 45% cho đơn trên 5 triệu.',
    status: 'SCHEDULED',
    startTime: daysFromNow(5),
    endTime: daysFromNow(8),
    commissionRate: 0.08,
    approvedBy: admin.id
  })
  await createCampaignProducts(campaign4.id, [
    {
      productId: products2[0].id,
      salePrice: 2890000,
      saleQuantity: 40,
      perUserLimit: 2
    }, // Leather jacket
    {
      productId: products2[11].id,
      salePrice: 2490000,
      saleQuantity: 30,
      perUserLimit: 2
    }, // Chelsea boots
    {
      productId: products2[12].id,
      salePrice: 1890000,
      saleQuantity: 60,
      perUserLimit: 2
    } // Cashmere sweater
  ])

  // Campaign 5 — APPROVED: Siêu Sale Gaming (TechViet)
  const campaign5 = await createCampaign({
    merchantId: merchant1.id,
    commissionCategoryId: catElec.id,
    name: 'Gaming Fiesta - PS5 & Nintendo',
    description:
      'Thiên đường game thủ: PlayStation 5, Nintendo Switch OLED, GoPro Hero12 và các phụ kiện gaming. Flash sale 48 giờ, số lượng rất giới hạn!',
    status: 'APPROVED',
    startTime: daysFromNow(10),
    endTime: daysFromNow(12),
    commissionRate: 0.05,
    approvedBy: admin.id
  })
  await createCampaignProducts(campaign5.id, [
    {
      productId: products1[7].id,
      salePrice: 9990000,
      saleQuantity: 25,
      perUserLimit: 1
    }, // PS5
    {
      productId: products1[12].id,
      salePrice: 5990000,
      saleQuantity: 35,
      perUserLimit: 1
    }, // Nintendo
    {
      productId: products1[11].id,
      salePrice: 6990000,
      saleQuantity: 30,
      perUserLimit: 1
    } // GoPro
  ])

  // Campaign 6 — APPROVED: Kitchen Upgrade (HomeLife)
  const campaign6 = await createCampaign({
    merchantId: merchant3.id,
    commissionCategoryId: catHome.id,
    name: 'Kitchen Upgrade - Máy Móc Bếp',
    description:
      'Nâng cấp bếp nhà bạn với deal chưa từng có: DeLonghi, Vitamix, Zojirushi và Philips XXL nồi chiên. Giao hàng miễn phí toàn quốc!',
    status: 'APPROVED',
    startTime: daysFromNow(8),
    endTime: daysFromNow(10),
    commissionRate: 0.06,
    approvedBy: admin.id
  })
  await createCampaignProducts(campaign6.id, [
    {
      productId: products3[2].id,
      salePrice: 17490000,
      saleQuantity: 15,
      perUserLimit: 1
    }, // DeLonghi
    {
      productId: products3[3].id,
      salePrice: 3290000,
      saleQuantity: 40,
      perUserLimit: 2
    }, // Air fryer
    {
      productId: products3[7].id,
      salePrice: 10990000,
      saleQuantity: 10,
      perUserLimit: 1
    }, // Vitamix
    {
      productId: products3[8].id,
      salePrice: 5990000,
      saleQuantity: 20,
      perUserLimit: 1
    } // Rice cooker
  ])

  // Campaign 7 — ENDED: Flash Sale Tết (TechViet)
  const campaign7 = await createCampaign({
    merchantId: merchant1.id,
    commissionCategoryId: catElec.id,
    name: 'Flash Sale Tết Bính Ngọ 2026',
    description:
      'Deal khủng mùa Tết: Apple Watch, Sony Headphone, Logitech MX Master 3S. Campaign đã kết thúc nhưng vẫn còn sản phẩm trong kho.',
    status: 'ENDED',
    startTime: daysAgo(25),
    endTime: daysAgo(20),
    commissionRate: 0.05,
    approvedBy: admin.id
  })
  await createCampaignProducts(campaign7.id, [
    {
      productId: products1[8].id,
      salePrice: 7990000,
      saleQuantity: 50,
      perUserLimit: 1
    }, // Apple Watch
    {
      productId: products1[5].id,
      salePrice: 5990000,
      saleQuantity: 60,
      perUserLimit: 1
    }, // Sony
    {
      productId: products1[13].id,
      salePrice: 1490000,
      saleQuantity: 100,
      perUserLimit: 2
    } // Logitech mouse
  ])

  // Campaign 8 — ENDED: Clearance Fashion (Fashion Hub)
  const campaign8 = await createCampaign({
    merchantId: merchant2.id,
    commissionCategoryId: catFashion.id,
    name: 'Clearance Sale - Thanh Lý Tồn Kho',
    description:
      'Thanh lý cuối vụ: jeans Levis, polo Ralph Lauren, Nike Air Max, Casio G-Shock. Giảm 50-60%, không hoàn trả. Đã kết thúc.',
    status: 'ENDED',
    startTime: daysAgo(15),
    endTime: daysAgo(12),
    commissionRate: 0.08,
    approvedBy: admin.id
  })
  await createCampaignProducts(campaign8.id, [
    {
      productId: products2[4].id,
      salePrice: 890000,
      saleQuantity: 100,
      perUserLimit: 3
    }, // Jeans
    {
      productId: products2[5].id,
      salePrice: 990000,
      saleQuantity: 100,
      perUserLimit: 3
    }, // Polo
    {
      productId: products2[6].id,
      salePrice: 1990000,
      saleQuantity: 60,
      perUserLimit: 2
    }, // Nike
    {
      productId: products2[8].id,
      salePrice: 2490000,
      saleQuantity: 50,
      perUserLimit: 1
    } // G-Shock
  ])

  // Campaign 9 — DRAFT: Siêu Sale Máy Lạnh (HomeLife)
  const campaign9 = await createCampaign({
    merchantId: merchant3.id,
    commissionCategoryId: catHome.id,
    name: 'Mùa Hè Sale - Điều Hòa & Tủ Lạnh',
    description:
      'Chuẩn bị cho mùa hè: điều hòa Daikin Inverter, tủ lạnh Samsung French Door, máy giặt LG AI DD. Đang trong giai đoạn chuẩn bị.',
    status: 'DRAFT',
    startTime: daysFromNow(20),
    endTime: daysFromNow(23),
    commissionRate: 0.06,
    approvedBy: null
  })
  await createCampaignProducts(campaign9.id, [
    {
      productId: products3[10].id,
      salePrice: 19490000,
      saleQuantity: 15,
      perUserLimit: 1
    }, // AC
    {
      productId: products3[11].id,
      salePrice: 13990000,
      saleQuantity: 12,
      perUserLimit: 1
    }, // Washing machine
    {
      productId: products3[12].id,
      salePrice: 33990000,
      saleQuantity: 8,
      perUserLimit: 1
    } // Refrigerator
  ])

  // Campaign 10 — DRAFT: Sunglasses & Accessories (Fashion Hub)
  const campaign10 = await createCampaign({
    merchantId: merchant2.id,
    commissionCategoryId: catFashion.id,
    name: 'Summer Vibes - Kính Mát & Phụ Kiện',
    description:
      'Bộ sưu tập mùa hè: kính Rayban Aviator, túi xách da, thắt lưng Saffiano. Đang chuẩn bị submit để admin duyệt.',
    status: 'DRAFT',
    startTime: daysFromNow(18),
    endTime: daysFromNow(21),
    commissionRate: 0.08,
    approvedBy: null
  })
  await createCampaignProducts(campaign10.id, [
    {
      productId: products2[9].id,
      salePrice: 2290000,
      saleQuantity: 50,
      perUserLimit: 2
    }, // Sunglasses
    {
      productId: products2[1].id,
      salePrice: 2590000,
      saleQuantity: 30,
      perUserLimit: 1
    }, // Handbag
    {
      productId: products2[10].id,
      salePrice: 890000,
      saleQuantity: 80,
      perUserLimit: 2
    }, // Belt
    {
      productId: products2[2].id,
      salePrice: 1690000,
      saleQuantity: 60,
      perUserLimit: 2
    } // Oxford shoes
  ])

  console.log(
    '✅ Campaigns: 2 ACTIVE, 2 SCHEDULED, 2 APPROVED, 2 ENDED, 2 DRAFT'
  )

  // ── 7. Pre-registrations (customers đăng ký nhận thông báo campaign) ───────
  await Promise.all([
    // Customer 1 & 2 đăng ký campaign sắp diễn ra
    prisma.preRegistration.createMany({
      data: [
        { customerId: customers[0].id, campaignId: campaign3.id },
        { customerId: customers[1].id, campaignId: campaign3.id },
        { customerId: customers[0].id, campaignId: campaign4.id },
        { customerId: customers[2].id, campaignId: campaign4.id },
        { customerId: customers[1].id, campaignId: campaign5.id },
        { customerId: customers[2].id, campaignId: campaign5.id }
      ],
      skipDuplicates: true
    })
  ])
  console.log('✅ Pre-registrations: 6 đăng ký nhận thông báo')

  // ── Tóm tắt ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(55))
  console.log('🎉 Seed hoàn tất!\n')
  console.log('📋 THÔNG TIN TÀI KHOẢN TEST:')
  console.log('─'.repeat(55))
  console.log(`  ADMIN`)
  console.log(`    Email   : admin@flashsale.vn`)
  console.log(`    Password: Admin@123456`)
  console.log('')
  console.log(`  CUSTOMERS (password: Test@123456)`)
  console.log(`    customer1@test.vn  — Nguyễn Văn An`)
  console.log(`    customer2@test.vn  — Trần Thị Bích`)
  console.log(`    customer3@test.vn  — Lê Minh Tuân`)
  console.log('')
  console.log(`  MERCHANTS (password: Test@123456)`)
  console.log(`    merchant1@techviet.vn   — TechViet Store`)
  console.log(`    merchant2@fashionhub.vn — Fashion Hub`)
  console.log(`    merchant3@homelife.vn   — HomeLife Vietnam`)
  console.log('─'.repeat(55))
  console.log(`  ✓ emailVerified = true → đăng nhập thẳng, không cần OTP`)
  console.log(`  ✓ Merchant kycStatus = APPROVED → tạo campaign được ngay`)
  console.log('─'.repeat(55))
  console.log(`\n📊 THỐNG KÊ DỮ LIỆU:`)
  console.log(`  • ${allProductCount} sản phẩm (14 + 13 + 13)`)
  console.log(
    `  • 10 campaigns (2 ACTIVE, 2 SCHEDULED, 2 APPROVED, 2 ENDED, 2 DRAFT)`
  )
  console.log(`  • 3 commission categories`)
  console.log(`  • 6 pre-registrations`)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function cleanDatabase(): Promise<void> {
  console.log('🗑️  Xóa dữ liệu cũ...')

  // Xóa theo thứ tự FK (leaf → root)
  const tables = [
    'outbox_events',
    'stock_allocations',
    'stock_audit_logs',
    'dead_letter_jobs',
    'telegram_deliveries',
    'telegram_links',
    'notification_preferences',
    'notifications',
    'commission_ledgers',
    'payment_webhook_logs',
    'payments',
    'order_items',
    'orders',
    'reservations',
    'pre_registrations',
    'campaign_reschedule_requests',
    'campaign_products',
    'campaigns',
    'inventory',
    'product_images',
    'products',
    'photo',
    'file_entities',
    'merchant_profiles',
    'customer_profiles',
    'users',
    'commission_categories',
    'payment_gateway_configs',
    'user_action_logs'
  ] as const

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)
    } catch {
      // Table có thể không tồn tại trong môi trường cũ — bỏ qua
    }
  }

  console.log('  ✅ Đã xóa dữ liệu cũ')
}

type ProductInput = {
  name: string
  desc: string
  price: number
  img: string
  inv: number
}

async function createProducts(
  merchantId: string,
  data: ProductInput[]
): Promise<Array<{ id: string }>> {
  const results: Array<{ id: string }> = []

  for (const p of data) {
    const imageUrl =
      PRODUCT_IMAGE_URLS[p.img] ??
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80'

    // FileEntity → Photo → ProductImage chain
    const fileEntityId = `fe-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`
    const photoId = `ph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    await prisma.fileEntity.create({
      data: {
        id: fileEntityId,
        fileName: `${p.img}.jpg`,
        url: imageUrl,
        mimeType: 'image/jpeg',
        size: 204800, // 200KB placeholder
        description: `Ảnh sản phẩm ${p.name}`,
        Photo: {
          create: {
            id: photoId,
            url: imageUrl
          }
        }
      }
    })

    const product = await prisma.product.create({
      data: {
        merchantId,
        name: p.name,
        description: p.desc,
        originalPrice: p.price,
        status: 'ACTIVE',
        inventory: {
          create: {
            quantity: p.inv,
            reserved: 0
          }
        },
        images: {
          create: {
            photoId,
            isPrimary: true,
            sortOrder: 0
          }
        }
      }
    })
    results.push({ id: product.id })
  }

  return results
}

type CampaignInput = {
  merchantId: string
  commissionCategoryId: string
  name: string
  description: string
  status: 'DRAFT' | 'APPROVED' | 'SCHEDULED' | 'ACTIVE' | 'ENDED'
  startTime: Date
  endTime: Date
  commissionRate: number
  approvedBy: string | null
}

async function createCampaign(input: CampaignInput) {
  return prisma.campaign.create({
    data: {
      merchantId: input.merchantId,
      commissionCategoryId: input.commissionCategoryId,
      name: input.name,
      description: input.description,
      status: input.status,
      startTime: input.startTime,
      endTime: input.endTime,
      commissionRate: input.commissionRate,
      approvedAt: input.approvedBy ? new Date() : null,
      approvedBy: input.approvedBy
    }
  })
}

type CampaignProductInput = {
  productId: string
  salePrice: number
  saleQuantity: number
  perUserLimit: number
}

async function createCampaignProducts(
  campaignId: string,
  products: CampaignProductInput[]
): Promise<void> {
  await prisma.campaignProduct.createMany({
    data: products.map(p => ({
      campaignId,
      productId: p.productId,
      salePrice: p.salePrice,
      saleQuantity: p.saleQuantity,
      remainingQuantity: p.saleQuantity,
      perUserLimit: p.perUserLimit
    }))
  })
}

// ─── Entry ────────────────────────────────────────────────────────────────────

main()
  .catch(e => {
    console.error('❌ Seed thất bại:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
