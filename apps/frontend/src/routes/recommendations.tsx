import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Bookmark } from 'lucide-react'
import { toast } from 'sonner'
import { useMyRecommendations } from '@/hooks/api/use-modules'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState, Loading } from '@/components/common/state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { requireAuth } from '@/lib/auth-guard'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const Route = createFileRoute('/recommendations')({
  beforeLoad: ({ location }) => requireAuth(location),
  component: RecommendationsPage,
})

interface RecSearch {
  limit?: number
}

const LIMIT_OPTIONS = [5, 10, 20, 50]
const DEFAULT_LIMIT = 10

function RecommendationsPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as RecSearch
  const limit = search.limit ?? DEFAULT_LIMIT

  const { data, isLoading, isError, refetch } = useMyRecommendations(limit)

  // limit 同步到 URL，刷新或分享时仍能复现
  const updateSearch = (patch: Partial<RecSearch>) => {
    void navigate({
      to: '/recommendations',
      search: { ...search, ...patch },
      replace: true,
    })
  }

  return (
    <div>
      <PageHeader
        title="为你推荐"
        description="基于你的阅读历史与偏好的个性化推荐。"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">条数</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => updateSearch({ limit: Number(v) })}
            >
              <SelectTrigger size="sm" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} 条
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorState message="加载推荐失败" onRetry={() => refetch()} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="暂无推荐"
          description="阅读几篇资源后即可获得个性化推荐"
        />
      ) : (
        <div className="space-y-4">
          {data.data.map((r) => {
            // 推荐分通常为 0~1，转成可读百分比
            const percent = Math.round(r.score * 100)
            return (
              <Card key={r.id}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/catalog/$resourceId"
                        params={{ resourceId: String(r.id) }}
                        className="text-base font-semibold hover:text-primary"
                      >
                        {r.title}
                      </Link>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {r.authors.join(', ')}
                        {r.year ? ` · ${r.year}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toast('加入阅读列表功能敬请期待')}
                    >
                      <Bookmark className="h-4 w-4" />
                      加入阅读列表
                    </Button>
                  </div>

                  {/* 推荐理由高亮 */}
                  <Badge
                    variant="secondary"
                    className="bg-amber-500/15 text-amber-700"
                  >
                    {r.reason}
                  </Badge>

                  {/* 匹配度进度条 */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>匹配度</span>
                      <span className="font-medium text-foreground">
                        {percent}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  {r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {(r.discipline || r.subdiscipline) && (
                    <p className="text-xs text-muted-foreground">
                      {[r.discipline, r.subdiscipline]
                        .filter(Boolean)
                        .join(' / ')}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
