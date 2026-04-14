import Redis from 'ioredis'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BehaviorSignals {
  /** Thời gian từ khi load trang đến khi click mua (milliseconds) */
  timeOnPageMs: number
  /** Có phát hiện di chuyển chuột không */
  hasMouse: boolean
  /** Có cuộn trang không */
  hasScroll: boolean
  /** Độ sâu cuộn tối đa theo phần trăm (0-100) */
  maxScrollDepth: number
  /** Tổng số lần click trên trang */
  clickCount: number
  /** Tab trình duyệt có đang được focus khi submit không */
  tabFocused: boolean
}

export interface FraudContext {
  ipAddress: string
  userId?: string
  userAgent: string
  requestType: string
  campaignId?: string
  behaviorSignals?: BehaviorSignals
}

export interface FraudRule {
  id: string
  name: string
  /**
   * Mức độ rủi ro đóng góp khi rule bị vi phạm.
   * Các score được cộng dồn; tổng tối đa là 1.0.
   * Score >= 1.0 = chắc chắn block (ví dụ: IP nằm trong blacklist).
   */
  score: number
  check: (ctx: FraudContext, redis: Redis) => Promise<boolean>
}

// ─── Bot User-Agent patterns ───────────────────────────────────────────────────

const BOT_UA_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /curl/i,
  /wget/i,
  /python-requests/i,
  /python-httpx/i,
  /aiohttp/i,
  /node-fetch/i,
  /axios\/\d/i, // axios/1.x (scripted)
  /go-http-client/i,
  /java\/\d/i,
  /libwww-perl/i,
  /postman/i,
  /insomnia/i,
  /httpie/i
]

// ─── Fraud Rules ───────────────────────────────────────────────────────────────

export const FRAUD_RULES: FraudRule[] = [
  /**
   * IP_RATE_LIMIT — Hơn 10 lần mua từ cùng IP trong 10 giây.
   * Score 0.95 = block ngay khi vi phạm một mình. Pattern bot phổ biến: retry loop liên tục.
   *
   * Edge case: CDN / corporate NAT → nhiều user hợp lệ dùng chung IP.
   * Counter tính PER campaign để giảm false positive.
   */
  {
    id: 'IP_RATE_LIMIT',
    name: 'IP vượt giới hạn tần suất (> 10 requests / 10 giây)',
    score: 0.95,
    check: async (ctx, redis) => {
      const key = `fraud:ip:rate:${ctx.ipAddress}:${ctx.campaignId ?? 'global'}`
      const count = await redis.incr(key)
      if (count === 1) {
        await redis.expire(key, 10)
      }
      return count > 10
    }
  },

  /**
   * BOT_USER_AGENT — Dấu hiệu công cụ tự động trong User-Agent.
   * Score 0.95 = block ngay khi vi phạm một mình. Hầu hết bot không giả mạo UA thuyết phục.
   *
   * Edge case: dev test bằng curl/Postman → chấp nhận false positive
   * trong context flash sale production (họ không nên mua hàng thật).
   */
  {
    id: 'BOT_USER_AGENT',
    name: 'User-Agent có dấu hiệu bot/tool',
    score: 0.95,
    check: async ctx => {
      return BOT_UA_PATTERNS.some(p => p.test(ctx.userAgent))
    }
  },

  /**
   * EMPTY_USER_AGENT — Không có User-Agent hoặc quá ngắn.
   * Trình duyệt hợp lệ luôn gửi UA string dài hơn 30 ký tự.
   */
  {
    id: 'EMPTY_USER_AGENT',
    name: 'Không có User-Agent hoặc quá ngắn',
    score: 0.9,
    check: async ctx => {
      return !ctx.userAgent || ctx.userAgent.trim().length < 10
    }
  },

  /**
   * IP_MULTI_ACCOUNT — Hơn 3 userId khác nhau từ cùng IP trong 1 giờ.
   * Score 0.7 = đáng ngờ nhưng không tự block một mình.
   * Kết hợp với các tín hiệu khác → block.
   *
   * Edge case: gia đình dùng chung IP. Ngưỡng đặt thận trọng ở 3.
   */
  {
    id: 'IP_MULTI_ACCOUNT',
    name: 'Nhiều tài khoản từ cùng IP (> 3 trong 1 giờ)',
    score: 0.7,
    check: async (ctx, redis) => {
      if (!ctx.userId) return false
      const key = `fraud:ip:accounts:${ctx.ipAddress}`
      await redis.sadd(key, ctx.userId)
      await redis.expire(key, 3600)
      const count = await redis.scard(key)
      return count > 3
    }
  },

  /**
   * TOO_FAST_PURCHASE — Mua hàng trong vòng dưới 1.5 giây từ khi load trang.
   * Con người cần ít nhất 1-2 giây để đọc, cuộn và click.
   * Bot submit ngay sau khi trang load xong.
   *
   * Score 0.55 = chỉ flag (< ngưỡng 0.75 một mình), kết hợp tín hiệu khác → block.
   * Edge case: trang đã pre-load + click trực tiếp — ngưỡng cố ý để rộng.
   */
  {
    id: 'TOO_FAST_PURCHASE',
    name: 'Mua quá nhanh (< 1.5 giây từ khi load trang)',
    score: 0.55,
    check: async ctx => {
      if (!ctx.behaviorSignals) return false
      return ctx.behaviorSignals.timeOnPageMs < 1500
    }
  },

  /**
   * NO_HUMAN_INTERACTION — Không có mouse movement VÀ không cuộn trang.
   * Bot thường không kích hoạt UI events.
   * Score 0.5 = phải kết hợp với tín hiệu khác mới block.
   *
   * Edge case: người dùng chỉ dùng bàn phím, mobile (không có chuột). Scroll cũng được kiểm tra.
   */
  {
    id: 'NO_HUMAN_INTERACTION',
    name: 'Không có mouse movement và không scroll',
    score: 0.5,
    check: async ctx => {
      if (!ctx.behaviorSignals) return false
      return !ctx.behaviorSignals.hasMouse && !ctx.behaviorSignals.hasScroll
    }
  },

  /**
   * VERY_NEW_ACCOUNT — Tài khoản tạo chưa đến 30 phút đã thực hiện mua hàng.
   * Pattern tài khoản dùng một lần trong scalping bot.
   * Score 0.45 = flag nhẹ, không tự block một mình.
   *
   * Đánh đổi: user mới hợp lệ cũng nên được mua. Giữ thấp để tránh friction không cần thiết.
   */
  {
    id: 'VERY_NEW_ACCOUNT',
    name: 'Tài khoản mới tạo (< 30 phút) thực hiện mua hàng',
    score: 0.45,
    check: async (ctx, redis) => {
      if (!ctx.userId) return false
      // Cache tuổi tài khoản trong Redis để tránh DB query mỗi lần mua
      const cacheKey = `fraud:user:age:${ctx.userId}`
      const cached = await redis.get(cacheKey)
      if (cached !== null) {
        return cached === 'new'
      }
      // Tra cứu DB thực tế được thực hiện ở FraudService để tránh circular dependency
      // Rule này trả về false khi chưa có cache (fallback thận trọng — fail-open)
      return false
    }
  }
]

// ─── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Trích xuất IP thực từ request, xử lý proxy headers.
 * X-Forwarded-For có thể chứa chuỗi phân cách bởi dấu phẩy: "client, proxy1, proxy2"
 * Lấy IP đầu tiên (bên trái nhất) — đó là client gốc.
 *
 * Edge case: X-Forwarded-For có thể bị giả mạo. Với production, cần cấu hình
 * trusted proxy ở cấp reverse-proxy (nginx/cloudflare).
 */
export function extractIp(
  xForwardedFor: string | undefined,
  remoteAddress: string | undefined
): string {
  if (xForwardedFor) {
    const first = xForwardedFor.split(',')[0]?.trim()
    if (first && isValidIp(first)) return first
  }
  return remoteAddress ?? '0.0.0.0'
}

/**
 * Parse header X-Behavior-Signals (JSON được encode base64).
 * Trả về undefined khi có lỗi parse — luôn fail-open để không chặn user hợp lệ.
 */
export function parseBehaviorSignals(
  header: string | undefined
): BehaviorSignals | undefined {
  if (!header) return undefined
  try {
    const json = Buffer.from(header, 'base64').toString('utf-8')
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') return undefined
    return parsed as BehaviorSignals
  } catch {
    return undefined
  }
}

function isValidIp(ip: string): boolean {
  // Kiểm tra cơ bản định dạng IPv4 và IPv6
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.includes(':')
}
