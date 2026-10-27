import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'

// Look at how this layout reads `params`: not at its top level, but inside a component behind <Suspense>.
// With Cache Components on, awaiting `params` (or cookies(), or a database read) at the top of a layout would make the whole
// subtree wait for the request and `next build` would refuse it. Keep that pattern in the pages you write.
export default function OrgLayout({ children, params }: LayoutProps<'/[orgSlug]'>) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <Suspense fallback={<div className="h-9 animate-pulse rounded bg-muted" />}>
        <OrgHeader params={params} />
      </Suspense>
      {children}
    </div>
  )
}

async function OrgHeader({ params }: { params: LayoutProps<'/[orgSlug]'>['params'] }) {
  const { orgSlug } = await params
  return <AppShell orgSlug={orgSlug} />
}
