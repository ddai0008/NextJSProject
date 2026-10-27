import { AuthForm } from '@/components/auth-form'

export const metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <AuthForm mode="login" />
    </main>
  )
}
