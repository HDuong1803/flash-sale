export enum RedisE {
  REDIS_AUTH_TOKEN_SESSION = 'auth_token_session',
  REDIS_REFRESH_TOKEN = 'refresh_token',
  REDIS_CONFIG_OPTS = 'redis_config_opts',
  EMAIL_OTP = 'email_otp',
  OTP_REQUEST_COUNT = 'otp_request_count',
  RESET_OTP = 'reset_otp',
  RESET_REQUEST_COUNT = 'reset_request_count',
  LINK_WALLET_OTP = 'link_wallet_otp',
  COGNITO_SESSION = 'cognito_session',
  ARENA_TOP_TOKENS = 'arena:top-tokens',
  ARENA_TOP_TOKENS_BACKUP = 'arena:top-tokens:backup',
  ALPHA_COMMUNITY_ANALYTICS = 'alpha:community-analytics',
  PAYMENT_COMPLETED_CHANNEL = 'order:payment:completed',
  ORDER_STATUS_CHANGED_CHANNEL = 'order:status:changed',
  VENDOR_RETRY_QUEUE = 'vendor:retry-queue'
}
