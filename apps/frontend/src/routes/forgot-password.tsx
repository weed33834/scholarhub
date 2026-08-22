import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createFileRoute, Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useForgotPassword } from '@/hooks/api/use-auth'
import { LanguageSwitcher } from '@/components/common/language-switcher'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const mut = useForgotPassword()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await mut.mutateAsync({ email })
      setSent(true)
      // backend 总是返回 200，不暴露账号是否存在
      toast.success(t('forgot.sentToast'))
    } catch {
      toast.error(t('toast.resetRequestFailed'))
    }
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md items-center">
      <LanguageSwitcher />
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">{t('forgot.title')}</CardTitle>
          <CardDescription>{t('forgot.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>{t('forgot.sentNotice')}</p>
              <p>
                <Link to="/login" className="text-primary hover:underline">
                  {t('forgot.backToLogin')}
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('forgot.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={mut.isPending}>
                {mut.isPending ? t('forgot.submitting') : t('forgot.submit')}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="text-primary hover:underline">
                  {t('forgot.backToLogin')}
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
