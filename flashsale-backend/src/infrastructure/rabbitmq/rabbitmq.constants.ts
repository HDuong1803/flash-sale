export const QUEUE_NAMES = {
  ORDER_HIGH: 'order.high',
  ORDER_NORMAL: 'order.normal',
  NOTIFICATION: 'notification',
  EMAIL: 'email',
  TELEGRAM: 'telegram.notification'
} as const

export const FAILED_QUEUE_NAMES = {
  ORDERS: 'failed_orders',
  NOTIFICATIONS: 'failed_notifications',
  EMAILS: 'failed_emails',
  TELEGRAM: 'failed_telegram_notifications'
} as const

export const RETRY_HEADER = 'x-retry-count'
