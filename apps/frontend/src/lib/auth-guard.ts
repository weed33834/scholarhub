import { redirect } from '@tanstack/react-router'

import { getAuthState } from '@/lib/auth'

interface GuardLocation {
  href: string
}

/**
 * Throw a redirect to /login carrying the original deep link so the
 * login page can send the user back to where they were headed after a
 * successful sign-in. Only in-app absolute paths are honoured.
 */
function loginRedirect(href: string): never {
  const target = href.startsWith('/') && !href.startsWith('//') ? href : '/dashboard'
  throw redirect({ to: '/login', search: { redirect: target } })
}

/** Route guard: any authenticated user. */
export function requireAuth(location: GuardLocation): void {
  if (!getAuthState().token) loginRedirect(location.href)
}

/** Route guard: admin only (implies authenticated). */
export function requireAdmin(location: GuardLocation): void {
  const state = getAuthState()
  if (!state.token || !state.isAdmin) loginRedirect(location.href)
}
