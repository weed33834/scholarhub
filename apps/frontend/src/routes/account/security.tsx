import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AxiosError } from 'axios'
import { Copy, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import {
  useChangePassword,
  useTwoFactorDisable,
  useTwoFactorEnable,
  useTwoFactorSetup,
  useTwoFactorStatus,
} from '@/hooks/api/use-auth'
import type { TwoFactorSetupResponse } from '@/lib/types'
import { extractError } from '@/lib/utils'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState, Loading } from '@/components/common/state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requireAuth } from '@/lib/auth-guard'

export const Route = createFileRoute('/account/security')({
  beforeLoad: ({ location }) => requireAuth(location),
  component: AccountSecurityPage,
})

function AccountSecurityPage() {
  return (
    <div>
      <PageHeader
        title="账号安全"
        description="管理登录密码与两步验证（2FA）。"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TwoFactorCard />
        <ChangePasswordCard />
      </div>
    </div>
  )
}

// --- 两步验证 ---

function TwoFactorCard() {
  const statusQ = useTwoFactorStatus()
  const setupMut = useTwoFactorSetup()
  const enableMut = useTwoFactorEnable()
  const disableMut = useTwoFactorDisable()

  // setup 返回的 secret/QR；非 null 表示正处于“扫码 → 输码确认”阶段
  const [setup, setSetup] = useState<TwoFactorSetupResponse | null>(null)
  const [confirmCode, setConfirmCode] = useState('')
  // enable 成功后一次性展示的恢复码
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [disableOpen, setDisableOpen] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')

  const onStartSetup = async () => {
    try {
      const res = await setupMut.mutateAsync()
      setSetup(res)
      setConfirmCode('')
    } catch (err) {
      toast.error(extractError(err, '生成密钥失败'))
    }
  }

  const onConfirmEnable = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await enableMut.mutateAsync({ code: confirmCode })
      setSetup(null)
      setRecoveryCodes(res.recovery_codes)
      toast.success('两步验证已开启')
    } catch (err) {
      toast.error(extractError(err, '验证码错误'))
    }
  }

  const onDisable = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await disableMut.mutateAsync({ password: disablePassword })
      setDisableOpen(false)
      setDisablePassword('')
      toast.success('两步验证已关闭')
    } catch (err) {
      toast.error(extractError(err, '密码错误'))
    }
  }

  const copyRecoveryCodes = () => {
    if (!recoveryCodes) return
    void navigator.clipboard.writeText(recoveryCodes.join('\n')).then(
      () => toast.success('恢复码已复制'),
      () => toast.error('复制失败，请手动抄写'),
    )
  }

  if (statusQ.isLoading) return <Loading />
  if (statusQ.isError || !statusQ.data)
    return <ErrorState message="加载失败" onRetry={() => statusQ.refetch()} />

  const { enabled, recovery_codes_remaining } = statusQ.data

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {enabled ? (
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          ) : (
            <ShieldOff className="h-5 w-5 text-muted-foreground" />
          )}
          两步验证
          {enabled ? (
            <Badge className="bg-emerald-500/15 text-emerald-700">已开启</Badge>
          ) : (
            <Badge variant="outline">未开启</Badge>
          )}
        </CardTitle>
        <CardDescription>
          登录时除密码外，再输入身份验证器 App（如 Google Authenticator、1Password）
          生成的 6 位动态码。即使密码泄露，账号仍受保护。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 一次性展示恢复码 */}
        {recoveryCodes && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
            <p className="mb-2 text-sm font-medium">
              请立即保存这些恢复码 —— 它们只显示这一次：
            </p>
            <div
              className="grid grid-cols-2 gap-1 font-mono text-sm"
              data-testid="recovery-codes"
            >
              {recoveryCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={copyRecoveryCodes}>
                <Copy className="h-4 w-4" /> 复制全部
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRecoveryCodes(null)}
              >
                我已保存
              </Button>
            </div>
          </div>
        )}

        {/* 阶段 2：扫码 + 确认 */}
        {!enabled && setup && (
          <form onSubmit={onConfirmEnable} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              用身份验证器 App 扫描二维码（或手动输入密钥），然后填入 App
              显示的 6 位验证码完成开启。
            </p>
            <div className="flex justify-center rounded-md border bg-white p-4">
              <QRCodeSVG value={setup.otpauth_uri} size={180} />
            </div>
            <p className="break-all text-center font-mono text-xs text-muted-foreground">
              {setup.secret}
            </p>
            <div className="space-y-2">
              <Label htmlFor="confirm-code">验证码</Label>
              <Input
                id="confirm-code"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                required
                minLength={6}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={enableMut.isPending}
                data-testid="confirm-enable-2fa"
              >
                {enableMut.isPending ? '开启中…' : '确认开启'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSetup(null)}
              >
                取消
              </Button>
            </div>
          </form>
        )}

        {enabled && (
          <p className="text-sm text-muted-foreground">
            剩余可用恢复码：{recovery_codes_remaining} 个。
            恢复码用完前请妥善保管；若全部用完且丢失验证器，将无法自助登录。
          </p>
        )}
      </CardContent>
      <CardFooter>
        {!enabled && !setup && (
          <Button
            onClick={onStartSetup}
            disabled={setupMut.isPending}
            data-testid="start-2fa-setup"
          >
            {setupMut.isPending ? '生成中…' : '开启两步验证'}
          </Button>
        )}
        {enabled && (
          <Button
            variant="outline"
            onClick={() => setDisableOpen(true)}
            data-testid="open-disable-2fa"
          >
            关闭两步验证
          </Button>
        )}
      </CardFooter>

      {/* 关闭 2FA：要求输入密码 */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>关闭两步验证</DialogTitle>
          </DialogHeader>
          <form onSubmit={onDisable} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              为防止被劫持的会话擅自关闭 2FA，请输入账号密码确认。
            </p>
            <div className="space-y-2">
              <Label htmlFor="disable-password">账号密码</Label>
              <Input
                id="disable-password"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDisableOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={disableMut.isPending}
                data-testid="confirm-disable-2fa"
              >
                {disableMut.isPending ? '关闭中…' : '确认关闭'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// --- 修改密码 ---

function ChangePasswordCard() {
  const changeMut = useChangePassword()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }
    try {
      await changeMut.mutateAsync({ oldPassword, newPassword })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      // 改密会 bump token_version：所有设备（含本设备）的旧 token 失效，
      // 提示用户重新登录而不是等下一个请求 401。
      toast.success('密码已修改，请重新登录')
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      toast.error(
        status === 401 ? '当前密码不正确' : extractError(err, '修改失败'),
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          修改密码
        </CardTitle>
        <CardDescription>
          修改后所有设备都需要重新登录。新密码至少 8 位。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="old-password">当前密码</Label>
            <Input
              id="old-password"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">新密码</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">确认新密码</Label>
            <Input
              id="confirm-new-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          <Button type="submit" disabled={changeMut.isPending}>
            {changeMut.isPending ? '修改中…' : '修改密码'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
