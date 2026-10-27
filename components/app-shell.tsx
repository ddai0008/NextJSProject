import Link from 'next/link'

// The frame around every page of an organisation. Given.
export function AppShell({ orgSlug }: { orgSlug: string }) {
  return (
    <header className="flex items-center justify-between border-b pb-3">
      <Link href={`/${orgSlug}`} className="font-semibold">
        Pipewise <span className="text-muted-foreground">/ {orgSlug}</span>
      </Link>
      <nav className="flex gap-4 text-sm">
        <Link href={`/${orgSlug}/contacts`} className="hover:underline">
          Contacts
        </Link>
        <Link href="/" className="text-muted-foreground hover:underline">
          Switch organisation
        </Link>
      </nav>
    </header>
  )
}
