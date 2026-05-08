export const config = {
  application: {
    PORT: 3000,
    BCRYPT_SALT: 10,
    HOST: '',
    ENV: 'development',
    isProd: false,
    CLIENT_URL: '',
    SERVER_URL: '',
    CLIENT_API_HOST: '',
    COOKIE_CROSS_SITE: 'false'
  },

  database: {
    DB_CONNECTOR: 'postgres',
    DB_HOST: '',
    DB_USER: '',
    DB_PASSWORD: '',
    DB_DATABASE: '',
    DB_PORT: 5432,
    DATABASE_URL: ''
  },

  secrets: {
    JWT_PRIVATE_KEY: '',
    JWT_REFRESH_PRIVATE_KEY: '',
    JWT_PUBLIC_KEY: '',
    JWT_ALGORITHM: 'HS256',
    JWT_EXPIRE_TIME: 86400,
    JWT_EXPIRE_REFRESH_TIME: 604800,
    SESSION_SECRET: '',
    JWT_SECRET_KEY: '',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: ''
  },

  logger: {
    GRAFANA_LOKI_URL: ''
  },

  redis: {
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    REDIS_USERNAME: '',
    REDIS_PASSWORD: '',
    REDIS_URL: '',
    REDIS_CACHE_EXPIRATION: '300'
  },

  rabbitmq: {
    RABBITMQ_URL: 'amqp://localhost:5672'
  },

  ipfs: {
    IPFS_WEB_GATEWAY: 'https://cloudflare-ipfs.com/ipfs/'
  },

  cloudinary: {
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: ''
  },

  stripe: {
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_CONNECT_COUNTRY: 'VN'
  },

  timeouts: {
    WEBHOOK_TIMEOUT_MS: 30_000,
    SLOW_REQUEST_THRESHOLD_MS: 1000,
    CHECKOUT_ADDRESS_TTL_SECONDS: 1200,
    LONG_RUNNING_REQUEST_TIMEOUT_MS: 60_000,
    NORMAL_REQUEST_TIMEOUT_MS: 30_000
  },

  postmark: {
    POSTMARK_SERVER_TOKEN: '',
    EMAIL_PROVIDER: 'resend',
    SENDER_EMAIL: '',
    EMAIL_SUPPORT: '',
    RESEND_API_KEY: ''
  },

  telegram: {
    BOT_TOKEN: '',
    BOT_USERNAME: '',
    WEBHOOK_SECRET: '',
    ALLOW_LEGACY_PATH_SECRET_AUTH: 'false'
  },

  ghn: {
    /** API Key sandbox — dùng cho order/fee API (dev-online-gateway.ghn.vn) */
    GHN_API_KEY: '',
    /** API Key production — dùng cho address master data (online-gateway.ghn.vn). Fallback về GHN_API_KEY nếu không set */
    GHN_ADDRESS_API_KEY: '',
    /** Shop ID từ GHN dashboard — tạo shop để lấy */
    GHN_SHOP_ID: '',
    /**
     * Sandbox mode: 'true' khi dùng dev-online-gateway.ghn.vn
     * Production: override trong production.ts với 'false'
     *
     * Sandbox setup:
     * 1. Đăng ký tại https://sso.ghn.vn/
     * 2. Tạo shop → lấy ShopID
     * 3. Settings → API → lấy API key
     * 4. Sandbox URL: https://dev-online-gateway.ghn.vn/shiip/public-api
     * 5. Production URL: https://online-gateway.ghn.vn/shiip/public-api
     */
    GHN_SANDBOX: 'true',
    /**
     * Token xác thực webhook — tự đặt khi cấu hình webhook trong GHN dashboard.
     * GHN gửi token này trong header X-GHN-Token của mỗi webhook request.
     */
    GHN_WEBHOOK_TOKEN: '',
    /**
     * District ID của kho hàng mặc định.
     * Ví dụ: 1442 = Quận 1, TP.HCM
     * Dùng để tính phí vận chuyển và lấy danh sách dịch vụ.
     */
    GHN_FROM_DISTRICT_ID: 1442,
    /**
     * Ward code của kho hàng mặc định.
     * Ví dụ: "20314" = Phường Bến Nghé, Quận 1, TP.HCM
     */
    GHN_FROM_WARD_CODE: '20314',
    /** Tên người gửi / cửa hàng */
    GHN_FROM_NAME: '',
    /** SĐT cửa hàng */
    GHN_FROM_PHONE: '',
    /** Địa chỉ chi tiết kho (số nhà, tên đường) */
    GHN_FROM_ADDRESS: '',
    /** Tên phường/xã kho */
    GHN_FROM_WARD_NAME: '',
    /** Tên quận/huyện kho */
    GHN_FROM_DISTRICT_NAME: '',
    /** Tên tỉnh/thành phố kho */
    GHN_FROM_PROVINCE_NAME: ''
  },

  anthropic: {
    ANTHROPIC_API_KEY: '',
    // claude-haiku-4-5: nhanh, rẻ, dùng cho classification
    ANTHROPIC_MODEL: 'claude-haiku-4-5-20251001'
  }
}
