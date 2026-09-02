import { useState } from 'react'
import { ApiError } from '../api/client'
import type { CurrentUser, LoginInput, RegistrationInput } from '../api/auth'

interface AuthScreenProps {
  onLogin: (input: LoginInput) => Promise<CurrentUser>
  onRegister: (input: RegistrationInput) => Promise<CurrentUser>
}

type AuthMode = 'login' | 'register'

export function AuthScreen({ onLogin, onRegister }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    if (new TextEncoder().encode(password).length > 72) {
      setError('Password must be 72 UTF-8 bytes or fewer.')
      setIsSubmitting(false)
      return
    }
    try {
      if (mode === 'register') {
        await onRegister({
          email,
          password,
          displayName: String(form.get('displayName') ?? ''),
        })
      } else {
        await onLogin({ email, password })
      }
    } catch (reason) {
      setError(authErrorMessage(reason))
    } finally {
      setIsSubmitting(false)
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError(null)
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand" aria-label="WanderMap">
          <span aria-hidden="true" className="brand-mark">W</span>
          <span className="brand-copy">
            <strong>WanderMap</strong>
            <small>Personal atlas</small>
          </span>
        </div>
        <p className="eyebrow">A visual travel journal</p>
        <h1 id="auth-title">{mode === 'login' ? 'Welcome back' : 'Begin your atlas'}</h1>
        <p className="auth-intro">
          {mode === 'login'
            ? 'Sign in to return to the places and stories that are yours.'
            : 'Create a private home for your journeys, places and memories.'}
        </p>
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          {mode === 'register' ? (
            <label>
              <span>Display name</span>
              <input autoComplete="name" maxLength={100} name="displayName" required />
            </label>
          ) : null}
          <label>
            <span>Email</span>
            <input autoComplete="email" maxLength={320} name="email" required type="email" />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              maxLength={72}
              minLength={mode === 'register' ? 8 : undefined}
              name="password"
              required
              type="password"
            />
          </label>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="button button-primary auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Opening your atlas…' : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </form>
        <p className="auth-switch">
          {mode === 'login' ? 'New to WanderMap?' : 'Already have an atlas?'}{' '}
          <button type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Create account' : 'Sign in'}
          </button>
        </p>
      </section>
    </main>
  )
}

function authErrorMessage(reason: unknown): string {
  if (reason instanceof ApiError) {
    if (reason.code === 'INVALID_CREDENTIALS') {
      return 'The email or password is incorrect.'
    }
    if (reason.code === 'EMAIL_ALREADY_EXISTS') {
      return 'An account with this email already exists.'
    }
    return reason.message
  }
  return reason instanceof Error ? reason.message : 'We could not complete that request. Please try again.'
}
