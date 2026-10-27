# A08 · Hint 3 (close to code)

The reference solution is `npm run solution 8`. The pieces, as outlines:

**The page (the data-reading part):**

```tsx
const { orgSlug, contactId } = await params
const ctx = await requireRole(orgSlug, 'rep')
const contact = await getContact(ctx, contactId)   // looked up INSIDE ctx.orgId
if (!contact) notFound()
// the DTO has companyName, not company; it has no phone
```

**The endpoint:**

```ts
export async function GET(_request: Request, { params }: RouteContext<'/api/orgs/[orgSlug]/contacts/[id]'>) {
  if (!(await getSession())) return Response.json({ error: 'Sign in.' }, { status: 401 })
  const { orgSlug, id } = await params
  const ctx = await requireRole(orgSlug, 'rep')
  const contact = await getContact(ctx, id)
  if (!contact) return Response.json({ error: 'No such contact.' }, { status: 404 })
  return Response.json(contact)
}
```

**The form and its action:**

```tsx
<form action={renameContactAction.bind(null, orgSlug, contact.id)} aria-label="Rename contact">
  {/* only the name field: no hidden orgSlug or contactId */}
</form>
```

```ts
export async function renameContactAction(orgSlug: string, contactId: string, formData: FormData) {
  const ctx = await requireRole(orgSlug, 'rep')
  const contact = await getContact(ctx, contactId)
  if (!contact) notFound()
  const name = String(formData.get('name') ?? '').trim()
  if (name) {
    try {
      await updateContact(ctx, contactId, { name, email: contact.email })   // keep the email
    } catch (error) {
      if (!(error instanceof ForbiddenError)) throw error                   // a rep who is not the owner: nothing changes
    }
  }
  redirect(`/${orgSlug}/contacts/${contactId}`)                              // outside the try
}
```

**Then:** delete `lib/dal/legacy-contacts.ts`, run `npm run act -- 8`, and finally `npm run act:upto -- 8`. If A08.6 or A08.7 names a function you did not write, read it before you fix it.
