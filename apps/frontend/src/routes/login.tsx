import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { isTwoFactorRequired } from '@/lib/types'
import { useLogin, useTwoFactorLogin } from '@/hooks/api/use-auth'
import { LanguageSwitcher } from '@/components/common/language-switcher'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const { t } = useTranslation('auth')
  const search = useSearch({ strict: false }) as { redirect?: string }
  const loginMut = useLogin()
  const twoFactorMut = useTwoFactorLogin()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  // 非 null = 密码已通过，等待第二因子（TOTP / 恢复码）
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')

  // 把守卫带来的深链还原成导航参数：只接受站内绝对路径；查询串拆成
  // search 对象，避免 navigate({ to }) 直接收到裸查询串。
  const resolveRedirectTarget = (
    raw?: string,
  ): { to: string; search?: Record<string, string> } => {
    const fallback = { to: '/dashboard' }
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback
    const [pathname, query = ''] = raw.split('?')
    if (!pathname) return fallback
    const search: Record<string, string> = {}
    for (const [k, v] of new URLSearchParams(query)) search[k] = v
    return Object.keys(search).length > 0 ? { to: pathname, search } : { to: pathname }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const result = await loginMut.mutateAsync({ username, password })
      if (isTwoFactorRequired(result)) {
        // 进入第二步；不落任何 token
        setPendingToken(result.pending_token)
        setTotpCode('')
        return
      }
      toast.success(t('toast.loginSuccess'))
      void navigate(resolveRedirectTarget(search.redirect))
    } catch (err) {
      const msg =
        err instanceof AxiosError
          ? (err.response?.data as { detail?: string })?.detail ?? t('toast.loginFailed')
          : t('toast.loginFailed')
      toast.error(msg)
    }
  }

  const onSubmitTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingToken) return
    try {
      await twoFactorMut.mutateAsync({
        pending_token: pendingToken,
        code: totpCode,
      })
      toast.success(t('toast.loginSuccess'))
      void navigate({ to: search.redirect ?? '/dashboard' })
    } catch (err) {
      const status =
        err instanceof AxiosError ? err.response?.status : undefined
      if (status === 401) {
        const detail =
          err instanceof AxiosError
            ? (err.response?.data as { detail?: string })?.detail
            : undefined
        // pending token 过期（5 分钟）→ 回到第一步重新输密码
        if (detail?.includes('session')) {
          toast.error(t('loginTwofa.sessionExpired'))
          setPendingToken(null)
          return
        }
        toast.error(t('loginTwofa.codeInvalid'))
        return
      }
      toast.error(t('loginTwofa.verifyFailed'))
    }
  }

  // OIDC SSO redirect: open /api/auth/oidc/{provider}/login directly.
  // The provider is checked against an allowlist so a polluted env var
  // cannot redirect the user to an attacker-controlled IdP.
  const OIDC_PROVIDERS = ['google', 'github', 'keycloak', 'generic'] as const
  const onOidcLogin = () => {
    const provider = import.meta.env.VITE_OIDC_PROVIDER ?? 'google'
    if (!OIDC_PROVIDERS.includes(provider as (typeof OIDC_PROVIDERS)[number])) {
      toast.error(t('toast.invalidOidcProvider'))
      return
    }
    window.location.href = `${api.defaults.baseURL}/auth/oidc/${provider}/login`
  }

  const oidcEnabled = import.meta.env.VITE_OIDC_ENABLED === 'true'

  // --- 第二步：两步验证 ---
  if (pendingToken) {
    return (
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center">
        <LanguageSwitcher />
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-2xl">{t('loginTwofa.title')}</CardTitle>
            <CardDescription>{t('loginTwofa.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmitTwoFactor} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="totp-code">{t('loginTwofa.codeLabel')}</Label>
                <Input
                  id="totp-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder={t('loginTwofa.codePlaceholder')}
                  autoFocus
                  required
                  minLength={6}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={twoFactorMut.isPending}
                data-testid="confirm-2fa"
              >
                {twoFactorMut.isPending ? t('loginTwofa.verifying') : t('loginTwofa.submit')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setPendingToken(null)}
              >{t('loginTwofa.back')}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md items-center">
      <LanguageSwitcher />
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">{t('login.title')}</CardTitle>
          <CardDescription>{t('login.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t('login.username')}</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('login.password')}</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-primary"
                >{t('login.forgot')}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loginMut.isPending}>
              {loginMut.isPending ? t('login.submitting') : t('login.submit')}
            </Button>
          </form>

          {oidcEnabled && (
            <>
              <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Separator className="flex-1" />
                {t('login.or')}
                <Separator className="flex-1" />
              </div>
              <Button variant="outline" className="w-full" onClick={onOidcLogin}>
                {t('login.sso')}
              </Button>
            </>
          )}

          <p className="mt-4 text-center text-sm text-muted-foreground">{t('login.noAccount')}{' '}
            <Link to="/register" className="text-primary hover:underline">{t('login.toRegister')}</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
