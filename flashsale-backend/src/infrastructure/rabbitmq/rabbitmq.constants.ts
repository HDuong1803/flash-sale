export const QUEUE_NAMES = {
  ORDER_HIGH: 'order.high',
  ORDER_NORMAL: 'order.normal',
  NOTIFICATION: 'notification',
  EMAIL: 'email'
} as const

export const FAILED_QUEUE_NAMES = {
  ORDERS: 'failed_orders',
  NOTIFICATIONS: 'failed_notifications',
  EMAILS: 'failed_emails'
} as const

export const RETRY_HEADER = 'x-retry-count'
