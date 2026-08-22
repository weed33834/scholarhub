import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AxiosError } from 'axios'
import { MoreHorizontal, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminUsers, useAssignRole, useRevokeRole, useSetUserActive } from '@/hooks/api/use-modules'
import { useAuth } from '@/hooks/use-auth'
import type { AssignableRole, UserResponse } from '@/lib/types'
import { PageHeader } from '@/components/common/page-header'
import { Pagination } from '@/components/common/pagination'
import { EmptyState, ErrorState, Loading } from '@/components/common/state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { requireAdmin } from '@/lib/auth-guard'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const PAGE_SIZE = 50

// 与后端 ASSIGNABLE_ROLES 一致；admin 角色由 is_admin 控制，不在此处
const ASSIGNABLE_ROLES: AssignableRole[] = [
  'reviewer',
  'editor',
  'section_editor',
  'author',
  'reader',
]

const ROLE_LABELS: Record<AssignableRole, string> = {
  reviewer: '审稿人',
  editor: '编辑',
  section_editor: '栏目编辑',
  author: '作者',
  reader: '读者',
}

export const Route = createFileRoute('/admin/users')({
  beforeLoad: ({ location }) => requireAdmin(location),
  component: AdminUsersPage,
})

function AdminUsersPage() {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  // 服务端搜索：q 直接进 queryKey（后端对 username/email 做全表匹配）。
  // 搜索词变化时由下方 effect 回到第 1 页。
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const offset = (page - 1) * PAGE_SIZE
  const { data, isLoading, isError, refetch } = useAdminUsers(
    PAGE_SIZE,
    offset,
    debouncedQuery,
  )
  const setActiveMut = useSetUserActive()
  const assignRoleMut = useAssignRole()
  const revokeRoleMut = useRevokeRole()
  const { user } = useAuth()

  // 后端返回裸数组无 meta，totalPages 用"当前页是否满页"推断：满页则假定还有下一页
  const totalPages = data && data.length >= PAGE_SIZE ? page + 1 : page
  const users = data ?? []

  const onToggleActive = async (u: UserResponse) => {
    try {
      await setActiveMut.mutateAsync({ userId: u.id, isActive: !u.is_active })
      toast.success(u.is_active ? '已禁用' : '已启用')
    } catch (err) {
      const msg =
        err instanceof AxiosError
          ? (err.response?.data as { detail?: string })?.detail ?? '操作失败'
          : '操作失败'
      toast.error(msg)
    }
  }

  // 点击角色 checkbox：已分配→撤销，未分配→分配
  const onToggleRole = async (u: UserResponse, role: AssignableRole) => {
    const has = (u.roles ?? []).includes(role)
    try {
      if (has) {
        await revokeRoleMut.mutateAsync({ userId: u.id, role })
        toast.success(`已撤销 ${ROLE_LABELS[role]} 角色`)
      } else {
        await assignRoleMut.mutateAsync({ userId: u.id, role })
        toast.success(`已分配 ${ROLE_LABELS[role]} 角色`)
      }
    } catch (err) {
      const msg =
        err instanceof AxiosError
          ? (err.response?.data as { detail?: string })?.detail ?? '操作失败'
          : '操作失败'
      toast.error(msg)
    }
  }

  return (
    <div>
      <PageHeader
        title="用户管理"
        description="管理租户内用户、启用状态与角色分配。"
        actions={
          data ? <Badge variant="secondary">当前页 {data.length}</Badge> : null
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索用户名或邮箱"
            className="pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorState message="加载用户失败" onRetry={() => refetch()} />
      ) : users.length === 0 ? (
        <EmptyState title="暂无用户" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户名</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>管理员</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>邮箱验证</TableHead>
                <TableHead>注册时间</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                // 后端会拒绝自助改 active，前端直接禁用当前 admin 自己那行
                const isSelf = user?.id === u.id
                const roles = u.roles ?? []
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          roles.map((r) => (
                            <Badge key={r} variant="outline" className="text-xs">
                              {ROLE_LABELS[r as AssignableRole] ?? r}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.is_admin ? 'default' : 'secondary'}>
                        {u.is_admin ? '是' : '否'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? 'default' : 'destructive'}>
                        {u.is_active ? '启用' : '禁用'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.is_email_verified ? 'default' : 'outline'}>
                        {u.is_email_verified ? '已验证' : '未验证'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(u.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" disabled={isSelf}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>用户操作</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => onToggleActive(u)}
                            disabled={setActiveMut.isPending}
                          >
                            {u.is_active ? '禁用账号' : '启用账号'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>角色分配</DropdownMenuLabel>
                          {ASSIGNABLE_ROLES.map((role) => {
                            const checked = roles.includes(role)
                            const pending =
                              (assignRoleMut.isPending && assignRoleMut.variables?.userId === u.id && assignRoleMut.variables?.role === role) ||
                              (revokeRoleMut.isPending && revokeRoleMut.variables?.userId === u.id && revokeRoleMut.variables?.role === role)
                            return (
                              <DropdownMenuCheckboxItem
                                key={role}
                                checked={checked}
                                disabled={pending}
                                onSelect={(e) => {
                                  e.preventDefault()
                                  void onToggleRole(u, role)
                                }}
                              >
                                {ROLE_LABELS[role]}
                              </DropdownMenuCheckboxItem>
                            )
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {data && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}
