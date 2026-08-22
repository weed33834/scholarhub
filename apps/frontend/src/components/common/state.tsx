import { AlertCircle, Inbox, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// 全屏骨架占位
export function Loading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center justify-center py-12 text-muted-foreground', className)}
    >
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      <span className="text-sm">加载中…</span>
    </div>
  )
}

export function ErrorState({
  message = '加载失败',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm text-primary underline-offset-2 hover:underline"
        >
          重试
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title = '暂无数据',
  description,
  action,
}: {
  title?: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
