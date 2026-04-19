import type { Permission } from '@/types'

export type NavItem = {
  label: string
  href: string
  iconName: string
  permission: Permission
  section: 'shopping' | 'shop_management' | 'admin'
  sectionLabel?: string
  description?: string
}

export const NAV_ITEMS: NavItem[] = [
  // ── SECTION: MUA SẮM ──────────────────────────────────────────────
  // Hiển thị cho: CUSTOMER + MERCHANT (merchant cũng là buyer)
  {
    label: 'Flash Sale',
    href: '/campaigns',
    iconName: 'Zap',
    permission: 'browse_campaigns',
    section: 'shopping',
    sectionLabel: 'Mua sắm',
  },
  {
    label: 'Đơn hàng',
    href: '/orders',
    iconName: 'ShoppingBag',
    permission: 'view_own_orders',
    section: 'shopping',
    description: 'Đơn bạn đã đặt mua',
  },
  {
    label: 'Thông báo',
    href: '/notifications',
    iconName: 'Bell',
    permission: 'view_notifications',
    section: 'shopping',
  },
  {
    label: 'Bảng điều khiển',
    href: '/customer/dashboard',
    iconName: 'LayoutGrid',
    permission: 'view_customer_dashboard',
    section: 'shopping',
  },

  // ── SECTION: QUẢN LÝ SHOP ─────────────────────────────────────────
  // Chỉ hiển thị cho: MERCHANT đã được APPROVED
  {
    label: 'Bảng điều khiển cửa hàng',
    href: '/merchant/dashboard',
    iconName: 'LayoutDashboard',
    permission: 'view_shop_dashboard',
    section: 'shop_management',
    sectionLabel: 'Quản lý cửa hàng',
  },
  {
    label: 'Chiến dịch',
    href: '/merchant/campaigns',
    iconName: 'Megaphone',
    permission: 'manage_campaigns',
    section: 'shop_management',
  },
  {
    label: 'Sản phẩm',
    href: '/merchant/products',
    iconName: 'Package',
    permission: 'manage_products',
    section: 'shop_management',
  },
  {
    label: 'Đơn nhận',
    href: '/merchant/orders',
    iconName: 'ClipboardList',
    permission: 'view_shop_orders',
    section: 'shop_management',
    description: 'Đơn khách đặt vào shop bạn',
  },
  {
    label: 'Doanh thu',
    href: '/merchant/revenue',
    iconName: 'BarChart2',
    permission: 'view_shop_revenue',
    section: 'shop_management',
  },
  {
    label: 'Cài đặt thanh toán',
    href: '/merchant/settings',
    iconName: 'CreditCard',
    permission: 'view_shop_dashboard',
    section: 'shop_management',
    description: 'Kết nối Stripe và quản lý payout',
  },

  // ── SECTION: QUẢN TRỊ HỆ THỐNG ────────────────────────────────────
  // Chỉ hiển thị cho: ADMIN
  {
    label: 'Tổng quan',
    href: '/admin/overview',
    iconName: 'LayoutDashboard',
    permission: 'admin_dashboard',
    section: 'admin',
    sectionLabel: 'Quản trị hệ thống',
  },
  {
    label: 'Nhà bán hàng',
    href: '/admin/merchants',
    iconName: 'Store',
    permission: 'admin_merchants',
    section: 'admin',
  },
  {
    label: 'Chiến dịch',
    href: '/admin/campaigns',
    iconName: 'Zap',
    permission: 'admin_campaigns',
    section: 'admin',
  },
  {
    label: 'Giám sát chiến dịch',
    href: '/admin/campaign-monitor',
    iconName: 'Activity',
    permission: 'admin_campaigns',
    section: 'admin',
  },
  {
    label: 'Tài chính',
    href: '/admin/payments',
    iconName: 'CreditCard',
    permission: 'admin_finance',
    section: 'admin',
  },
  {
    label: 'Người dùng',
    href: '/admin/users',
    iconName: 'Users',
    permission: 'admin_users',
    section: 'admin',
  },
  {
    label: 'Hồ sơ nhà bán hàng',
    href: '/admin/merchant-profiles',
    iconName: 'Building2',
    permission: 'admin_profiles',
    section: 'admin',
  },
  {
    label: 'Hàng đợi lỗi',
    href: '/admin/dead-letter-queue',
    iconName: 'AlertTriangle',
    permission: 'admin_system',
    section: 'admin',
  },
  {
    label: 'Nhật ký thao tác',
    href: '/admin/user-action-logs',
    iconName: 'ScrollText',
    permission: 'admin_action_logs',
    section: 'admin',
  },
  {
    label: 'Sự kiện chờ gửi',
    href: '/admin/outbox-events',
    iconName: 'Radio',
    permission: 'admin_outbox',
    section: 'admin',
  },
  {
    label: 'Hệ thống',
    href: '/admin/system',
    iconName: 'Server',
    permission: 'admin_system',
    section: 'admin',
  },
  // {
  //   label: 'Benchmark Lock',
  //   href: '/admin/benchmark',
  //   iconName: 'FlaskConical',
  //   permission: 'admin_benchmark',
  //   section: 'admin',
  //   description: 'So sánh NO_LOCK vs DB_LOCK vs Redis Lua',
  // },
  {
    label: 'Phát hiện gian lận',
    href: '/admin/fraud',
    iconName: 'ShieldAlert',
    permission: 'admin_fraud',
    section: 'admin',
    description: 'Fraud events, blacklist IP',
  },
  {
    label: 'Phân tích & Dự đoán',
    href: '/admin/analytics',
    iconName: 'TrendingUp',
    permission: 'admin_analytics',
    section: 'admin',
    description: 'Funnel, heatmap, stockout prediction',
  },
  {
    label: 'Fulfillment & QC',
    href: '/admin/fulfillment',
    iconName: 'Truck',
    permission: 'admin_system',
    section: 'admin',
    description: 'Carriers, routing rules, QC station',
  },
]

export const SECTION_ORDER: NavItem['section'][] = [
  'shopping',
  'shop_management',
  'admin',
]
