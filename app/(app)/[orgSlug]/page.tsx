import Link from 'next/link'
import { Suspense } from 'react'

export default function OrgHome({ params }: PageProps<'/[orgSlug]'>) {
  return (
    <main className="space-y-2">
      <h1 className="text-2xl font-semibold">Welcome</h1>
      <Suspense>
        <ContactsLink params={params} />
      </Suspense>
    </main>
  )
}

async function ContactsLink({ params }: { params: PageProps<'/[orgSlug]'>['params'] }) {
  const { orgSlug } = await params
  return (
    <Link href={`/${orgSlug}/contacts`} className="text-primary underline-offset-4 hover:underline">
      Go to the contacts
    </Link>
  )
}
