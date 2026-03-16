/**
 * SSE authentication: the browser sends the access_token HttpOnly cookie
 * automatically when withCredentials is set on the EventSource.
 * No manual token attachment needed.
 */
class DashboardService {
  connect(campaignId: string): EventSource {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'
    const url = `${baseUrl}/dashboard/${campaignId}/stream`

    // withCredentials: true → browser includes HttpOnly cookies (access_token)
    return new EventSource(url, { withCredentials: true })
  }
}

export const dashboardService = new DashboardService()
