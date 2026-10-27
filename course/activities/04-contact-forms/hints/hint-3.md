# A04 · Hint 3 (close to code)

The reference solution is `npm run solution 4`. These are the pieces that usually take longest.

**Finding the SQLSTATE under Drizzle's wrapper:**

```ts
export function sqlState(error: unknown): string | undefined {
  let current = error as { code?: unknown; cause?: unknown } | undefined
  for (let depth = 0; depth < 6 && current; depth++) {
    if (typeof current.code === 'string' && /^[0-9A-Z]{5}$/.test(current.code)) return current.code
    current = current.cause as typeof current
  }
}
// 23505 = unique_violation
```

**The action, in outline:**

```ts
'use server'
export async function createContactAction(orgSlug: string, _previous: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const ctx = await requireRole(orgSlug, 'rep')
  const values = { name: String(formData.get('name') ?? ''), email: String(formData.get('email') ?? '') }
  const parsed = contactSchema.safeParse(values)
  if (!parsed.success) return { status: 'error', values, fieldErrors: /* field → message */ }
  try {
    await createContact(ctx, parsed.data)
  } catch (error) {
    if (/* unique violation */) return { status: 'error', values, fieldErrors: { email: '…already uses that email…' } }
    console.error('createContact failed', error)
    return { status: 'error', values, message: 'The contact could not be saved. Try again.' }
  }
  updateTag(`contacts:${ctx.orgId}`)          // from 'next/cache'; Server Actions only
  return { status: 'ok', values: { name: '', email: '' } }
}
```

For the edit action, after the `try/catch` ends (not inside it): `updateTag(...)`, then `redirect(`/${orgSlug}/contacts`)`.

**The form component** (`'use client'`):

```tsx
const [state, formAction, pending] = useActionState(action, { status: 'idle', values: defaults })
return (
  <form action={formAction} aria-label={label}>
    <Label htmlFor={nameId}>Name</Label>
    <Input id={nameId} name="name" defaultValue={state.values.name} aria-invalid={errors.name ? true : undefined} />
    {errors.name && <p role="alert">{errors.name}</p>}
    {/* the same for Email */}
    <Button type="submit" disabled={pending}>{submitLabel}</Button>
  </form>
)
```

A Server Action can be passed to a Client Component as a prop (it crosses the boundary as a reference, not as code). That is why this works while X1 does not.

**The cached total**, next to the component that renders it:

```tsx
async function totalFor(ctx: RequestContext) {
  'use cache'
  cacheTag(`contacts:${ctx.orgId}`)
  cacheLife('minutes')
  return countContacts(ctx)
}
async function Total({ params }) {
  const { orgSlug } = await params
  const ctx = await requireRole(orgSlug, 'rep')   // request-time work stays OUTSIDE the cached function
  return <p>{(await totalFor(ctx)).toLocaleString('en-US')} contacts</p>
}
```

Put `<Total>` inside its own `<Suspense>` (it awaits `params`), as in A03.

**The data layer.** A malformed id: test it against a UUID pattern before it reaches the database (Postgres would raise `22P02`). `createContact` must write `orgId: ctx.orgId` and take nothing else about the organisation from `input`.
