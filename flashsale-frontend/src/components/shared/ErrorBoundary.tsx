'use client'

/**
 * ErrorBoundary — React class component bắt lỗi trong cây component con.
 *
 * Dùng khi muốn isolate lỗi: nếu một section của UI crash,
 * phần còn lại vẫn hoạt động bình thường.
 *
 * Tích hợp Sentry:
 * - Mỗi lần componentDidCatch được gọi → Sentry.captureException()
 * - Đính kèm componentStack để biết chính xác component nào gây lỗi
 *
 * Cách dùng:
 * ```tsx
 * <ErrorBoundary fallback={<p>Không thể tải phần này</p>}>
 *   <RiskyComponent />
 * </ErrorBoundary>
 *
 * // Hoặc dùng HOC:
 * export default withErrorBoundary(MyPage, {
 *   fallback: <ErrorFallback />
 * })
 * ```
 */
import * as Sentry from '@sentry/nextjs'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode
  /** Custom fallback UI khi có lỗi. Nhận onReset callback để user có thể thử lại. */
  fallback?: ReactNode | ((onReset: () => void) => ReactNode)
}

interface State {
  hasError: boolean
  error: Error | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Capture lên Sentry kèm component stack trace
    // Component stack giúp biết chính xác component hierarchy nào gây lỗi
    Sentry.captureException(error, {
      extra: {
        componentStack: info.componentStack,
      },
    })
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    // Nếu có custom fallback → dùng nó
    if (this.props.fallback) {
      return typeof this.props.fallback === 'function'
        ? this.props.fallback(this.handleReset)
        : this.props.fallback
    }

    // Default fallback UI — khớp với design system aurora glassmorphism
    return <DefaultErrorFallback onReset={this.handleReset} />
  }
}

// ─── Default Fallback UI ──────────────────────────────────────────────────────

function DefaultErrorFallback({ onReset }: { onReset: () => void }) {
  return (
    <div className="glass rounded-2xl p-6 text-center space-y-4">
      <div className="flex justify-center">
        <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
          <AlertCircle size={24} className="text-red-400" />
        </div>
      </div>
      <div>
        <p className="text-white font-semibold text-sm">Đã xảy ra lỗi</p>
        <p className="text-white/40 text-xs mt-1">
          Phần này không thể hiển thị. Đội kỹ thuật đã được thông báo.
        </p>
      </div>
      <button
        onClick={onReset}
        className="flex items-center gap-1.5 mx-auto text-indigo-400 text-xs hover:text-indigo-300 transition-colors"
      >
        <RefreshCw size={12} />
        Thử lại
      </button>
    </div>
  )
}

// ─── HOC helper ───────────────────────────────────────────────────────────────

/**
 * withErrorBoundary — Higher-Order Component wrapper.
 * Tiện dùng hơn khi muốn wrap toàn bộ page component.
 *
 * @example
 * export default withErrorBoundary(CheckoutPage, {
 *   fallback: (reset) => <div>Checkout lỗi. <button onClick={reset}>Thử lại</button></div>
 * })
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: { fallback?: Props['fallback'] }
) {
  const displayName = WrappedComponent.displayName ?? WrappedComponent.name ?? 'Component'

  function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={options?.fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }

  WithErrorBoundaryWrapper.displayName = `WithErrorBoundary(${displayName})`
  return WithErrorBoundaryWrapper
}
