import Link from 'next/link'

// Static on purpose: it needs no request and no database, so it is part of the prerendered shell.
const ORGS = [
  { slug: 'kestrel', name: 'Kestrel Solar' },
  { slug: 'acme', name: 'Acme Freight' },
  { slug: 'lumen', name: 'Lumen Dental' },
  { slug: 'harbor', name: 'Harbor & Finch LLP' },
]

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <h1 className="text-3xl font-semibold">Pipewise CRM</h1>
      <p className="text-muted-foreground">Pick an organisation. (Real sign-in arrives in A05.)</p>
      <ul className="space-y-2">
        {ORGS.map((org) => (
          <li key={org.slug}>
            <Link href={`/${org.slug}/contacts`} className="text-primary underline-offset-4 hover:underline">
              {org.name}
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        <Link href="/login" className="underline-offset-4 hover:underline">
          Sign in
        </Link>{' '}
        ·{' '}
        <Link href="/register" className="underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </main>
  )
}
