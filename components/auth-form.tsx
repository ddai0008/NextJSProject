'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// The sign-in and sign-up form. Given. It talks to the JSON endpoints you build in A05:
//   POST /api/auth/login     { email, password }        -> 200 and a session cookie
//   POST /api/auth/register  { email, name, password }  -> 201 { id }
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const data = Object.fromEntries(new FormData(event.currentTarget))
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (response.ok) {
        if (mode === 'register') router.push('/login')
        else router.push('/')
        router.refresh()
      } else {
        setError(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? `Something went wrong (${response.status}).`)
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === 'register' && (
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </Button>
    </form>
  )
}
