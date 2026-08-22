import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { useResetPassword } from '@/hooks/api/use-auth'
import { LanguageSwitcher } from '@/components/common/language-switcher'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const navigate = useNavigate()
  const { t } = useTranslation('auth')
  const search = useSearch({ strict: false }) as { token?: string }
  const mut = useResetPassword()
  const [token, setToken] = useState(search.token ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  // Strip the token query param from the URL as soon as it is read, so it
  // does not linger in browser history or get captured in screenshots.
  useEffect(() => {
    if (search.token && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [search.token])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      toast.error(t('toast.passwordMismatch'))
      return
    }
    if (password.length < 8) {
      toast.error(t('toast.passwordTooShort'))
      return
    }
    try {
      await mut.mutateAsync({ token, new_password: password })
      toast.success(t('toast.resetSuccess'))
      void navigate({ to: '/login' })
    } catch (err) {
      const msg =
        err instanceof AxiosError
          ? (err.response?.data as { detail?: string })?.detail ??
            t('toast.resetFailed')
          : t('toast.resetFailed')
      toast.error(msg)
    }
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md items-center">
      <LanguageSwitcher />
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">{t('reset.title')}</CardTitle>
          <CardDescription>{t('reset.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">{t('reset.tokenLabel')}</Label>
              <Input
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('reset.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t('reset.confirm')}</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={mut.isPending}>
              {mut.isPending ? t('reset.submitting') : t('reset.submit')}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">
              {t('reset.backToLogin')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
