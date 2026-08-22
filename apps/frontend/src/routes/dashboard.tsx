import { createFileRoute, Link } from '@tanstack/react-router'
import {
  BookOpen,
  Lightbulb,
  Bell,
  Library,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { requireAuth } from '@/lib/auth-guard'
import { useIsMobile } from '@/hooks/use-is-mobile'
import {
  useCatalogStats,
  useMyRecommendations,
  useNotifications,
  usePendingSubmissions,
  useReadingLists,
} from '@/hooks/api/use-modules'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState, Loading } from '@/components/common/state'
import { StatTile } from '@/components/mobile/StatTile'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: ({ location }) => requireAuth(location),
  component: DashboardPage,
})

interface StatCard {
  label: string
  value: string | number
  to: string
  icon: LucideIcon
}

function DashboardPage() {
  const stats = useCatalogStats()
  const recs = useMyRecommendations(5)
  const notifs = useNotifications(1, 5)
  const lists = useReadingLists(1, 5)
  const pending = usePendingSubmissions(1, 5)
  const isMobile = useIsMobile()

  const cards: StatCard[] = [
    {
      label: '资源总数',
      value: stats.data?.total ?? '—',
      to: '/catalog',
      icon: BookOpen,
    },
    {
      label: '我的推荐',
      value: recs.data?.meta.total ?? '—',
      to: '/recommendations',
      icon: Lightbulb,
    },
    {
      label: '未读通知',
      value: notifs.data?.meta.total ?? '—',
      to: '/notifications',
      icon: Bell,
    },
    {
      label: '阅读列表',
      value: lists.data?.meta.total ?? '—',
      to: '/library',
      icon: Library,
    },
    {
      label: '我的提交',
      value: pending.data?.meta.total ?? '—',
      to: '/submissions',
      icon: ScrollText,
    },
  ]

  return (
    <div>
      <PageHeader
        title="概览"
        description="你的 ScholarHUB 工作台一览。"
      />
      {/* 移动端：2 列大数据块 + 快捷操作；桌面端：5 列小卡 */}
      {isMobile ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {cards.map((c) => (
              <StatTile
                key={c.to}
                label={c.label}
                value={
                  stats.isLoading && c.label === '资源总数' ? (
                    <Skeleton className="h-7 w-12" />
                  ) : (
                    c.value
                  )
                }
                to={c.to}
                icon={c.icon}
              />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3" data-testid="mobile-quick-actions">
            <Button asChild className="flex-col gap-1 py-3" variant="outline">
              <Link to="/catalog">
                <BookOpen className="h-5 w-5" />
                <span className="text-xs">浏览目录</span>
              </Link>
            </Button>
            <Button asChild className="flex-col gap-1 py-3" variant="outline">
              <Link to="/submissions">
                <ScrollText className="h-5 w-5" />
                <span className="text-xs">我的提交</span>
              </Link>
            </Button>
            <Button asChild className="flex-col gap-1 py-3" variant="outline">
              <Link to="/recommendations">
                <Lightbulb className="h-5 w-5" />
                <span className="text-xs">推荐</span>
              </Link>
            </Button>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {cards.map((c) => {
            const Icon = c.icon
            return (
              <Link
                key={c.to}
                to={c.to}
                className="block transition-transform hover:-translate-y-0.5"
              >
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      {c.label}
                    </CardTitle>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">
                      {stats.isLoading && c.label === '资源总数' ? (
                        <Skeleton className="h-7 w-12" />
                      ) : (
                        c.value
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">为你推荐</CardTitle>
          </CardHeader>
          <CardContent>
            {recs.isLoading ? (
              <Loading />
            ) : recs.isError ? (
              <ErrorState message="加载推荐失败" />
            ) : recs.data?.data.length ? (
              <ul className="space-y-3">
                {recs.data.data.slice(0, 5).map((r) => (
                  <li key={r.id} className="border-b pb-2 last:border-0 last:pb-0">
                    <Link
                      to="/catalog/$resourceId"
                      params={{ resourceId: String(r.id) }}
                      className="block hover:text-primary"
                    >
                      <p className="line-clamp-1 text-sm font-medium">{r.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {r.authors.join(', ')} · {r.reason}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="暂无推荐"
                description="阅读几篇资源后即可获得个性化推荐"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">最新通知</CardTitle>
            <Link to="/notifications" className="text-xs text-primary hover:underline">
              查看全部
            </Link>
          </CardHeader>
          <CardContent>
            {notifs.isLoading ? (
              <Loading />
            ) : notifs.isError ? (
              <ErrorState message="加载通知失败" />
            ) : notifs.data?.data.length ? (
              <ul className="space-y-3">
                {notifs.data.data.slice(0, 5).map((n) => (
                  <li key={n.id} className="border-b pb-2 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{n.title}</p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {n.body}
                          </p>
                        )}
                      </div>
                      {!n.is_read && <Badge variant="secondary" className="shrink-0">新</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="暂无通知" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
