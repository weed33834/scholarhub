/**
 * Cookie consent banner — GDPR / ePrivacy lite.
 *
 * Three-state policy stored in localStorage:
 *   - "accepted"  → user accepted all non-essential cookies
 *   - "essential"  → user opted out of non-essential cookies
 *   - unset       → banner is shown; no decision yet
 *
 * Non-essential cookies in this app:
 *   - csrf (set by backend on first GET; same-origin, JS-readable so
 *     double-submit middleware can compare it to X-CSRF-Token header)
 *
 * Essential cookies (always on, not gated by this banner):
 *   - scholarhub_refresh_token (httpOnly, server-side)
 *   - scholarhub_csrf (when backend csrf middleware is enabled)
 *   - scholarhub_tenant (when tenancy middleware runs)
 */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

type ConsentValue = 'accepted' | 'essential'

const CONSENT_KEY = 'scholarhub_cookie_consent'

function readConsent(): ConsentValue | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY)
    if (raw === 'accepted' || raw === 'essential') return raw
  } catch {
    // localStorage can be unavailable (private mode, disabled).
    // Fall back to a no-banner state rather than crashing the app.
  }
  return null
}

function writeConsent(value: ConsentValue): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, value)
  } catch {
    // ignore
  }
}

export function CookieBanner() {
  // null = undecided (show banner), otherwise hide.
  const [consent, setConsent] = useState<ConsentValue | null>(() => readConsent())

  // Cross-tab sync: if another tab sets a decision, hide here too.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== CONSENT_KEY) return
      setConsent(readConsent())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  if (consent !== null) return null

  const accept = () => {
    writeConsent('accepted')
    setConsent('accepted')
  }
  const essentialOnly = () => {
    writeConsent('essential')
    setConsent('essential')
  }

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Cookie consent"
      data-testid="cookie-banner"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-3xl rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur sm:bottom-6 sm:left-auto sm:right-6 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex-1 text-sm text-foreground/90">
          <p className="font-medium">We use cookies</p>
          <p className="mt-1 text-foreground/70">
            Essential cookies keep you signed in. Optional cookies help with
            CSRF protection. You can change your choice anytime in settings.{' '}
            <a
              href="/privacy"
              className="underline hover:text-foreground"
            >
              Privacy policy
            </a>
            .
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={essentialOnly}
            data-testid="cookie-banner-essential"
          >
            Essential only
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={accept}
            data-testid="cookie-banner-accept"
          >
            Accept all
          </Button>
        </div>
      </div>
    </div>
  )
}