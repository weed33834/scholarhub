import { useRef, useState } from 'react'
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouterState,
  useSearch,
} from '@tanstack/react-router'
import {
  Download,
  ExternalLink,
  FileText,
  History,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  downloadSubmissionFile,
  useCreateSubmission,
  useDeleteSubmission,
  useMySubmissions,
  useResubmitSubmission,
  useSubmissionReports,
  useSubmissionVersions,
  useUpdateSubmission,
  useUploadSubmissionFile,
} from '@/hooks/api/use-modules'
import type {
  IngestResource,
  ReviewReportResponse,
  SubmissionCreate,
  SubmissionResponse,
  SubmissionStatus,
  SubmissionType,
} from '@/lib/types'
import { extractError } from '@/lib/utils'
import { PageHeader } from '@/components/common/page-header'
import { Pagination } from '@/components/common/pagination'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState, ErrorState, Loading } from '@/components/common/state'
import WorkflowTimeline from '@/components/WorkflowTimeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { requireAuth } from '@/lib/auth-guard'

// 注册 router state 的 preset 字段：ingest 页通过 navigate state 传预填数据，
// 借助 HistoryState 接口的声明合并让两端都类型安全
declare module '@tanstack/history' {
  interface HistoryState {
    preset?: IngestResource
  }
}

export const Route = createFileRoute('/submissions/')({
  beforeLoad: ({ location }) => requireAuth(location),
  component: SubmissionsPage,
})

interface SubmissionSearch {
  status?: SubmissionStatus | 'all'
  page?: number
}

const TYPE_OPTIONS: { value: SubmissionType; label: string }[] = [
  { value: 'paper', label: '论文' },
  { value: 'book', label: '图书' },
  { value: 'dataset', label: '数据集' },
  { value: 'tutorial', label: '教程' },
]

const STATUS_TABS: { value: SubmissionStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待审核' },
  { value: 'under_review', label: '审核中' },
  { value: 'major_revision', label: '大修' },
  { value: 'minor_revision', label: '小修' },
  { value: 'accepted', label: '已接收' },
  { value: 'rejected', label: '已拒绝' },
]

interface FormState {
  title: string
  type: SubmissionType
  authors: string
  year: string
  discipline: string
  abstract: string
  preview: string
  venue: string
  subdiscipline: string
  tags: string
  keywords: string
  jel_codes: string
  corresponding_author_email: string
  doi: string
  download_url: string
  external_url: string
}

const EMPTY_FORM: FormState = {
  title: '',
  type: 'paper',
  authors: '',
  year: String(new Date().getFullYear()),
  discipline: '',
  abstract: '',
  preview: '',
  venue: '',
  subdiscipline: '',
  tags: '',
  keywords: '',
  jel_codes: '',
  corresponding_author_email: '',
  doi: '',
  download_url: '',
  external_url: '',
}

// 详情 → 表单：作者点「修改稿件」时把现有内容回填进同一套表单
function submissionToForm(s: SubmissionResponse): FormState {
  const validTypes: SubmissionType[] = ['paper', 'book', 'dataset', 'tutorial']
  return {
    title: s.title,
    type: validTypes.includes(s.type as SubmissionType)
      ? (s.type as SubmissionType)
      : 'paper',
    authors: s.authors.join(', '),
    year: String(s.year),
    discipline: s.discipline,
    abstract: s.abstract,
    preview: s.preview,
    venue: s.venue ?? '',
    subdiscipline: s.subdiscipline ?? '',
    tags: s.tags.join(', '),
    keywords: s.keywords.join(', '),
    jel_codes: s.jel_codes.join(', '),
    corresponding_author_email: s.corresponding_author_email ?? '',
    doi: s.doi ?? '',
    download_url: s.download_url ?? '',
    external_url: s.external_url ?? '',
  }
}

// 作者可编辑内容的状态（与后端 update_submission 的状态门一致）
const EDITABLE_STATUSES = ['pending', 'major_revision', 'minor_revision']

// ingest 预填：IngestResource.type 是 SubmissionType 的超集，需收敛到合法值
function presetToForm(p: IngestResource): FormState {
  const validTypes: SubmissionType[] = ['paper', 'book', 'dataset', 'tutorial']
  const type = validTypes.includes(p.type as SubmissionType)
    ? (p.type as SubmissionType)
    : 'paper'
  return {
    ...EMPTY_FORM,
    title: p.title,
    type,
    authors: p.authors.join(', '),
    year: p.year ? String(p.year) : EMPTY_FORM.year,
    discipline: p.discipline,
    abstract: p.abstract,
    preview: p.abstract,
    venue: p.venue ?? '',
    subdiscipline: p.subdiscipline ?? '',
    tags: p.tags.join(', '),
    doi: p.doi ?? '',
  }
}

function statusBadge(status: SubmissionStatus) {
  switch (status) {
    case 'pending':
      return <Badge variant="secondary">待审核</Badge>
    case 'under_review':
      return <Badge className="bg-blue-500/15 text-blue-700">审核中</Badge>
    case 'major_revision':
      return <Badge className="bg-amber-500/15 text-amber-700">大修</Badge>
    case 'minor_revision':
      return <Badge className="bg-yellow-500/15 text-yellow-700">小修</Badge>
    case 'accepted':
    case 'approved':
      return <Badge className="bg-emerald-500/15 text-emerald-700">已接收</Badge>
    case 'rejected':
      return <Badge variant="destructive">已拒绝</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function SubmissionsPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as SubmissionSearch
  const statusTab = (search.status ?? 'all') as SubmissionStatus | 'all'
  const page = search.page ?? 1
  const status = statusTab === 'all' ? undefined : statusTab

  const { data, isLoading, isError, refetch } = useMySubmissions(status, page, 20)
  const createMut = useCreateSubmission()
  const deleteMut = useDeleteSubmission()
  const uploadMut = useUploadSubmissionFile()
  const resubmitMut = useResubmitSubmission()
  const updateMut = useUpdateSubmission()

  const [createOpen, setCreateOpen] = useState(false)
  // null = 新建模式；数字 = 正在编辑该 submission（复用同一套表单）
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [detail, setDetail] = useState<SubmissionResponse | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [resubmitOpen, setResubmitOpen] = useState(false)
  const [resubmitNote, setResubmitNote] = useState('')
  // 仅在 detail 对话框打开时拉取审稿报告 / 版本历史（hook 通过 enabled 守卫）；
  // 必须放在 detail useState 之后，否则 TS2448/2454 报"使用先于声明"。
  const reportsQ = useSubmissionReports(detail?.id ?? 0)
  const versionsQ = useSubmissionVersions(detail?.id ?? 0, detail !== null)

  const onUploadFile = async (file: File) => {
    if (!detail) return
    try {
      const updated = await uploadMut.mutateAsync({ id: detail.id, file })
      setDetail(updated)
      toast.success('文件已上传')
    } catch (err) {
      toast.error(extractError(err, '上传失败'))
    }
  }

  // 大修/小修状态下作者重投，触发 submission → resubmitted → under_review。
  // 重投会把当前稿件内容快照为一个新版本，note 随版本存档并推送给编辑。
  const onResubmit = async () => {
    if (!detail) return
    try {
      const updated = await resubmitMut.mutateAsync({
        id: detail.id,
        note: resubmitNote.trim() || undefined,
      })
      setDetail(updated)
      setResubmitOpen(false)
      setResubmitNote('')
      toast.success('已重投，等待编辑再次审核')
    } catch (err) {
      toast.error(extractError(err, '重投失败'))
    }
  }

  // 作者修改稿件内容：复用新建表单，提交走 PATCH 而非 POST
  const onStartEdit = () => {
    if (!detail) return
    setForm(submissionToForm(detail))
    setEditingId(detail.id)
    setCreateOpen(true)
  }

  // ingest 页 "提交到目录" 通过 router state 传预填数据
  const preset = useRouterState({
    select: (s) => s.location.state?.preset,
  })
  const presetHandled = useRef(false)
  // eslint-disable-next-line react-hooks/refs
  if (preset && !presetHandled.current) {
    presetHandled.current = true
    setForm(presetToForm(preset))
    setCreateOpen(true)
  }

  const updateSearch = (patch: Partial<SubmissionSearch>) => {
    void navigate({
      to: '/submissions',
      search: { ...search, ...patch },
      replace: true,
    })
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const body: SubmissionCreate = {
      title: form.title,
      type: form.type,
      authors: form.authors.split(',').map((s) => s.trim()).filter(Boolean),
      year: Number(form.year),
      discipline: form.discipline,
      abstract: form.abstract,
      preview: form.preview,
      tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
      keywords: form.keywords
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      jel_codes: form.jel_codes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      corresponding_author_email: form.corresponding_author_email || undefined,
      venue: form.venue || undefined,
      subdiscipline: form.subdiscipline || undefined,
      doi: form.doi || undefined,
      download_url: form.download_url || undefined,
      external_url: form.external_url || undefined,
    }
    try {
      if (editingId !== null) {
        // 编辑模式：PATCH 全量字段（表单已回填原值，未动的字段等值覆盖无副作用）
        const updated = await updateMut.mutateAsync({ id: editingId, body })
        setDetail(updated)
        toast.success('稿件已更新')
      } else {
        await createMut.mutateAsync(body)
        toast.success('提交成功，等待审核')
      }
      setCreateOpen(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
    } catch (err) {
      toast.error(extractError(err, editingId !== null ? '更新失败' : '提交失败'))
    }
  }

  const onConfirmDelete = async () => {
    if (deleteId === null) return
    const target = deleteId
    setDeleteId(null)
    try {
      await deleteMut.mutateAsync(target)
      toast.success('已撤销提交')
    } catch (err) {
      toast.error(extractError(err, '撤销失败'))
    }
  }

  return (
    <div>
      <PageHeader
        title="我的提交"
        description="查看你提交的资源及审核状态。"
        actions={
          <Button
            onClick={() => {
              setForm(EMPTY_FORM)
              setCreateOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            新建提交
          </Button>
        }
      />

      <Tabs
        value={statusTab}
        onValueChange={(v) =>
          updateSearch({ status: v as SubmissionStatus | 'all', page: 1 })
        }
      >
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorState message="加载提交失败" onRetry={() => refetch()} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="暂无提交"
          description="新建一条提交，等待管理员审核。"
        />
      ) : (
        <Card className="mt-4">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead className="w-20">类型</TableHead>
                  <TableHead>学科</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-32">提交时间</TableHead>
                  <TableHead className="w-24">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => setDetail(s)}
                  >
                    <TableCell className="font-medium">{s.title}</TableCell>
                    <TableCell>{s.type}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.discipline}
                    </TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(s.submitted_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {s.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteId(s.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          撤销
                        </Button>
                      )}
                      {/* 录用后物化出的目录条目：作者需要一条直达自己已发表文章的路径，
                          否则"录用"之后整条链路就断在这里了 */}
                      {s.resource_id != null && (
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            to="/catalog/$resourceId"
                            params={{ resourceId: String(s.resource_id) }}
                          >
                            <ExternalLink className="h-4 w-4" />
                            查看发表
                          </Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data && (
        <Pagination
          page={data.meta.page}
          totalPages={data.meta.total_pages}
          onPageChange={(p) => updateSearch({ page: p })}
        />
      )}

      {/* 详情 Dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{detail.type}</Badge>
                {statusBadge(detail.status)}
                <span className="text-muted-foreground">{detail.discipline}</span>
                <span className="text-muted-foreground">{detail.year}</span>
              </div>
              <WorkflowTimeline
                status={detail.status}
                submittedAt={new Date(detail.submitted_at)}
                reviewedAt={detail.reviewed_at ? new Date(detail.reviewed_at) : null}
                reviewedBy={detail.reviewed_by ?? null}
              />
              <div>
                <span className="text-muted-foreground">作者：</span>
                {detail.authors.join(', ')}
              </div>
              {detail.venue && (
                <div>
                  <span className="text-muted-foreground">出版物：</span>
                  {detail.venue}
                </div>
              )}
              {detail.subdiscipline && (
                <div>
                  <span className="text-muted-foreground">子学科：</span>
                  {detail.subdiscipline}
                </div>
              )}
              {detail.keywords && detail.keywords.length > 0 && (
                <div>
                  <span className="text-muted-foreground">关键词：</span>
                  {detail.keywords.join(', ')}
                </div>
              )}
              {detail.jel_codes && detail.jel_codes.length > 0 && (
                <div>
                  <span className="text-muted-foreground">JEL Codes：</span>
                  {detail.jel_codes.join(', ')}
                </div>
              )}
              {detail.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {detail.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              <div>
                <span className="text-muted-foreground">摘要</span>
                <p className="mt-1 whitespace-pre-wrap">{detail.abstract}</p>
              </div>
              <div>
                <span className="text-muted-foreground">预览</span>
                <p className="mt-1 whitespace-pre-wrap">{detail.preview}</p>
              </div>
              {detail.doi && (
                <div>
                  <span className="text-muted-foreground">DOI：</span>
                  {detail.doi}
                </div>
              )}
              {detail.download_url && (
                <div>
                  <span className="text-muted-foreground">下载：</span>
                  {detail.download_url}
                </div>
              )}
              {detail.external_url && (
                <div>
                  <span className="text-muted-foreground">外部链接：</span>
                  {detail.external_url}
                </div>
              )}
              {detail.admin_note && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <span className="text-muted-foreground">审核备注：</span>
                  {detail.admin_note}
                </div>
              )}
              {detail.editor_note && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <span className="text-muted-foreground">编辑备注：</span>
                  {detail.editor_note}
                </div>
              )}
              {/* 已发表：录用后物化出的目录条目对访客也公开可见，
                  给作者一个可直接分享的公开链接 */}
              {detail.resource_id != null && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    <span className="font-medium">已发表</span>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    本文已收录进公开目录，任何人无需登录即可查看。
                  </p>
                  <Button size="sm" variant="outline" asChild>
                    <Link
                      to="/catalog/$resourceId"
                      params={{ resourceId: String(detail.resource_id) }}
                    >
                      查看发表页面
                    </Link>
                  </Button>
                </div>
              )}
              <div className="rounded-md border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="font-medium">稿件文件</span>
                  {detail.file_path ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700">
                      已上传
                    </Badge>
                  ) : (
                    <Badge variant="outline">未上传</Badge>
                  )}
                </div>
                {detail.file_path && (
                  <div className="mb-2 flex items-center gap-2">
                    <span className="break-all text-xs text-muted-foreground">
                      {detail.file_path}
                    </span>
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                      onClick={() => void downloadSubmissionFile(detail.id)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载
                    </button>
                  </div>
                )}
                {/* 仅 pending / major_revision / minor_revision 可上传 */}
                {['pending', 'major_revision', 'minor_revision'].includes(
                  detail.status,
                ) && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primary hover:underline">
                    <Upload className="h-4 w-4" />
                    {detail.file_path ? '替换文件' : '上传 PDF'}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.doc,.txt,.zip,.ps"
                      disabled={uploadMut.isPending}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void onUploadFile(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
              </div>
              {/* 审稿意见（单盲：作者只可见 comments_to_author，审稿人身份保密） */}
              {reportsQ.data && reportsQ.data.length > 0 && (
                <div className="rounded-md border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">审稿意见</span>
                    <span className="text-xs text-muted-foreground">
                      （单盲：审稿人身份保密）
                    </span>
                  </div>
                  <div className="space-y-2">
                    {reportsQ.data.map((r: ReviewReportResponse) => (
                      <div
                        key={r.id}
                        className="rounded bg-muted/50 p-2 text-sm"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant="outline">
                            推荐：{r.recommendation}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(r.submitted_at).toLocaleString()}
                          </span>
                        </div>
                        {r.comments_to_author ? (
                          <p className="whitespace-pre-wrap">
                            {r.comments_to_author}
                          </p>
                        ) : (
                          <p className="text-xs italic text-muted-foreground">
                            审稿人未给作者意见
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* 版本历史：v1 = 初次提交，之后每次重投一个版本 */}
              {versionsQ.data && versionsQ.data.length > 0 && (
                <div className="rounded-md border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <History className="h-4 w-4" />
                    <span className="font-medium">版本历史</span>
                  </div>
                  <ol className="space-y-2">
                    {versionsQ.data.map((v) => (
                      <li key={v.id} className="flex gap-2 text-sm">
                        <Badge variant="outline" className="shrink-0">
                          v{v.version}
                        </Badge>
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">
                            {v.version === 1 ? '初次提交' : '重投'} ·{' '}
                            {new Date(v.created_at).toLocaleString()}
                            {v.file_path ? ' · 含稿件文件' : ''}
                          </div>
                          {v.note && (
                            <p className="mt-0.5 whitespace-pre-wrap text-sm">
                              修改说明：{v.note}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {/* 操作区：可编辑状态下开放「修改稿件」；大修/小修额外开放「重投」 */}
              {EDITABLE_STATUSES.includes(detail.status) && (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={onStartEdit}>
                    <Pencil className="h-4 w-4" />
                    修改稿件
                  </Button>
                  {['major_revision', 'minor_revision'].includes(
                    detail.status,
                  ) && (
                    <Button onClick={() => setResubmitOpen(true)}>
                      <RefreshCw className="h-4 w-4" />
                      重投提交
                    </Button>
                  )}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                提交于 {new Date(detail.submitted_at).toLocaleString()}
                {detail.reviewed_at && (
                  <>
                    {' · 审核于 '}
                    {new Date(detail.reviewed_at).toLocaleString()}
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 新建 / 修改稿件 Dialog（复用同一套表单，editingId 区分模式） */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o)
          if (!o) setEditingId(null)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId !== null ? '修改稿件' : '新建提交'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">类型</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => set('type', v as SubmissionType)}
                >
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">年份</Label>
                <Input
                  id="year"
                  type="number"
                  value={form.year}
                  onChange={(e) => set('year', e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">标题</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="authors">作者（逗号分隔）</Label>
              <Input
                id="authors"
                value={form.authors}
                onChange={(e) => set('authors', e.target.value)}
                placeholder="Alice Smith, Bob Jones"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="discipline">学科</Label>
                <Input
                  id="discipline"
                  value={form.discipline}
                  onChange={(e) => set('discipline', e.target.value)}
                  placeholder="如 computer science"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subdiscipline">子学科</Label>
                <Input
                  id="subdiscipline"
                  value={form.subdiscipline}
                  onChange={(e) => set('subdiscipline', e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="abstract">摘要</Label>
              <Textarea
                id="abstract"
                value={form.abstract}
                onChange={(e) => set('abstract', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preview">预览（留空将自动截取摘要）</Label>
              <Textarea
                id="preview"
                value={form.preview}
                onChange={(e) => set('preview', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tags">标签（逗号分隔）</Label>
                <Input
                  id="tags"
                  value={form.tags}
                  onChange={(e) => set('tags', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doi">DOI</Label>
                <Input
                  id="doi"
                  value={form.doi}
                  onChange={(e) => set('doi', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="venue">出版物</Label>
                <Input
                  id="venue"
                  value={form.venue}
                  onChange={(e) => set('venue', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="download_url">下载链接</Label>
                <Input
                  id="download_url"
                  type="url"
                  value={form.download_url}
                  onChange={(e) => set('download_url', e.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="external_url">外部链接</Label>
                <Input
                  id="external_url"
                  type="url"
                  value={form.external_url}
                  onChange={(e) => set('external_url', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="keywords">关键词（逗号分隔）</Label>
                <Input
                  id="keywords"
                  value={form.keywords}
                  onChange={(e) => set('keywords', e.target.value)}
                  placeholder="machine learning, transformers"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="jel_codes">JEL Codes（逗号分隔）</Label>
                <Input
                  id="jel_codes"
                  value={form.jel_codes}
                  onChange={(e) => set('jel_codes', e.target.value)}
                  placeholder="C00, D83"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="corresponding_author_email">
                  通讯作者邮箱（可选）
                </Label>
                <Input
                  id="corresponding_author_email"
                  type="email"
                  value={form.corresponding_author_email}
                  onChange={(e) =>
                    set('corresponding_author_email', e.target.value)
                  }
                  placeholder="corresponding@example.com"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateOpen(false)
                  setEditingId(null)
                }}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending}
              >
                {editingId !== null
                  ? updateMut.isPending
                    ? '保存中…'
                    : '保存修改'
                  : createMut.isPending
                    ? '提交中…'
                    : '提交'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 重投 Dialog：可附「针对审稿意见做了哪些修改」，随版本存档并通知编辑 */}
      <Dialog
        open={resubmitOpen}
        onOpenChange={(o) => {
          setResubmitOpen(o)
          if (!o) setResubmitNote('')
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>重投提交</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              重投会把稿件当前内容存为一个新版本并交回编辑。若还没改完，
              先关掉这里用「修改稿件」编辑内容。
            </p>
            <div className="space-y-2">
              <Label htmlFor="resubmit-note">修改说明（可选）</Label>
              <Textarea
                id="resubmit-note"
                rows={4}
                value={resubmitNote}
                onChange={(e) => setResubmitNote(e.target.value)}
                placeholder="例如：按审稿人 1 的意见补充了稳健性检验，重写了 3.2 节。"
              />
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResubmitOpen(false)}
              >
                取消
              </Button>
              <Button
                onClick={onResubmit}
                disabled={resubmitMut.isPending}
                data-testid="confirm-resubmit"
              >
                {resubmitMut.isPending ? '处理中…' : '确认重投'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        title="撤销提交"
        description="确定撤销这条提交吗？此操作不可撤销。"
        confirmText="撤销"
        destructive
        onConfirm={onConfirmDelete}
        onOpenChange={(o) => !o && setDeleteId(null)}
      />
    </div>
  )
}
