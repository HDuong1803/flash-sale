export const queryKeys = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  campaigns: {
    all: ['campaigns'] as const,
    list: (params?: object) => ['campaigns', 'list', params] as const,
    detail: (id: string) => ['campaigns', 'detail', id] as const,
    my: () => ['campaigns', 'my'] as const,
    commissionCategories: () => ['campaigns', 'commission-categories'] as const,
  },
  merchants: {
    all: ['merchants'] as const,
    list: (params?: object) => ['merchants', 'list', params] as const,
    pending: () => ['merchants', 'pending'] as const,
    pendingCount: () => ['merchants', 'pending-count'] as const,
    applicationStatus: () => ['merchants', 'application-status'] as const,
    stats: () => ['merchants', 'stats'] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: (params?: object) => ['orders', 'list', params] as const,
    detail: (id: string) => ['orders', 'detail', id] as const,
    reservation: (id: string) => ['orders', 'reservation', id] as const,
    merchant: (params?: object) => ['orders', 'merchant', params] as const,
  },
  products: {
    all: ['products'] as const,
    my: () => ['products', 'my'] as const,
    detail: (id: string) => ['products', 'detail', id] as const,
  },
  users: {
    all: ['users'] as const,
    me: () => ['users', 'me'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
    preferences: () => ['notifications', 'preferences'] as const,
    telegramStatus: () => ['notifications', 'telegram-status'] as const,
  },
  admin: {
    all: ['admin'] as const,
    merchants: (params?: object) => ['admin', 'merchants', params] as const,
    campaigns: (params?: object) => ['admin', 'campaigns', params] as const,
    users: (params?: object) => ['admin', 'users', params] as const,
    stats: () => ['admin', 'stats'] as const,
    health: () => ['admin', 'health'] as const,
    queueStats: () => ['admin', 'queue-stats'] as const,
    logs: () => ['admin', 'logs'] as const,
    deadLetterQueue: () => ['admin', 'dead-letter-queue'] as const,
    activity: () => ['admin', 'activity'] as const,
    revenueTrend: () => ['admin', 'revenue-trend'] as const,
    ordersByTime: (start: string, end: string) => ['admin', 'orders-by-time', start, end] as const,
    merchantProfiles: (params?: object) => ['admin', 'merchant-profiles', params] as const,
    merchantOverview: (merchantId: string, days: number) =>
      ['admin', 'merchant-overview', merchantId, days] as const,
    userActionLogs: (params?: object) => ['admin', 'user-action-logs', params] as const,
    outboxEvents: (params?: object) => ['admin', 'outbox-events', params] as const,
    financeSummary: () => ['admin', 'finance', 'summary'] as const,
    financeTrend: () => ['admin', 'finance', 'trend'] as const,
    financeByCategory: () => ['admin', 'finance', 'by-category'] as const,
    paymentGateways: () => ['admin', 'payments', 'gateways'] as const,
    campaignMonitorOverview: (params?: object) =>
      ['admin', 'campaign-monitor', 'overview', params] as const,
    campaignMonitorTimeline: (params?: object) =>
      ['admin', 'campaign-monitor', 'timeline', params] as const,
  },
  checkout: {
    paymentMethods: () => ['checkout', 'payment-methods'] as const,
  },
} as const
