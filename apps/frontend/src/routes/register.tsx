import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { useRegister } from '@/hooks/api/use-auth'
import { LanguageSwitcher } from '@/components/common/language-switcher'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

function RegisterPage() {
  const navigate = useNavigate()
  const { t } = useTranslation('auth')
  const registerMut = useRegister()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

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
      await registerMut.mutateAsync({ email, username, password })
      toast.success(t('toast.registerSuccess'))
      void navigate({ to: '/verify-email', search: { email } })
    } catch (err) {
      const msg =
        err instanceof AxiosError
          ? (err.response?.data as { detail?: string })?.detail ??
            t('toast.registerFailed')
          : t('toast.registerFailed')
      toast.error(msg)
    }
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md items-center">
      <LanguageSwitcher />
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">{t('register.title')}</CardTitle>
          <CardDescription>{t('register.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('register.email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">{t('register.username')}</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                minLength={3}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('register.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t('register.confirm')}</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={registerMut.isPending}>
              {registerMut.isPending ? t('register.submitting') : t('register.submit')}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('register.hasAccount')}{' '}
            <Link to="/login" className="text-primary hover:underline">
              {t('register.toLogin')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
