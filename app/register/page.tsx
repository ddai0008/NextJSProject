import { AuthForm } from '@/components/auth-form'

export const metadata = { title: 'Create an account' }

export default function RegisterPage() {
  return (
    <main className="mx-auto w-full max-w-sm space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <AuthForm mode="register" />
    </main>
  )
}
