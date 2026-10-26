# Diagnostic

Ten questions. Answer from your mental model **before** running anything: I'm measuring what you believe, not what
the compiler will tell you. "I don't know" is a useful answer. Skipping the explanation is not: give the *why* in a
sentence, because a right answer for a wrong reason looks identical to a right answer.

Add a confidence per answer: **1** guess, **2** fairly sure, **3** certain. Reply in chat, or write under each
"Your answer".

**Setup for every question** unless it says otherwise: the project in this repo. Next.js 16.4.3, App Router,
TypeScript, `next.config.ts` has `cacheComponents: true` and `partialPrefetching: true`, "build" means `next build`.

---

## Q0. Intake (not scored)

1. Last Next.js version you used, and App Router or Pages Router? ("unsure" is fine.)
2. Path to an old project to calibrate from, if you have one.
3. The goal and the deadline (e.g. "ship X in 2 weeks"), and hours per day.

---

## Q1. Predict: where does this run?

```tsx
// app/page.tsx   (no directive)
import Chart from './chart'
export default function Page() { return <Chart /> }
```
```tsx
// app/chart.tsx
'use client'
import Table from './table'
export default function Chart() { return <Table /> }
```
```tsx
// app/table.tsx   (no directive)
export default function Table() {
  console.log('TABLE')
  return <table />
}
```

Where can the `console.log('TABLE')` execute? (a) server only (b) browser only (c) both (d) it's a build error.
State the rule that decides it, in one sentence.

## Q2. Spot the bug

```tsx
// app/page.tsx   (no directive)
import Button from './button'
export default function Page() {
  return <Button onClick={() => console.log('hi')} />
}
```
```tsx
// app/button.tsx
'use client'
export default function Button({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick}>go</button>
}
```

What happens, and at which step does it fail: your editor, `tsc`, `next build`, or only in the browser? Give two
different fixes and say when you'd pick each.

## Q3. Predict

```ts
// app/actions.ts
'use server'
import { redirect } from 'next/navigation'

export async function save(formData: FormData) {
  try {
    await db.insert({ title: String(formData.get('title')) })
    redirect('/done')
  } catch {
    return { error: 'Could not save' }
  }
}
```

The insert succeeds. What does the user see after submitting the form, and why? How would you fix it?

## Q4. Spot the bug

```ts
// app/actions.ts
'use server'
export async function addTodo(formData: FormData) {
  return { saved: String(formData.get('title')) }
}
```
```tsx
// app/form.tsx
'use client'
import { useActionState } from 'react'
import { addTodo } from './actions'

export function Form() {
  const [state, action, pending] = useActionState(addTodo, null)
  return (
    <form action={action}>
      <input name="title" />
      <button disabled={pending}>Add</button>
      <p>{state?.saved}</p>
    </form>
  )
}
```

What's wrong, and what is the real first argument of `addTodo` here? Does anything catch it before runtime?

## Q5. Predict (three environments)

```tsx
// app/blog/[slug]/page.tsx
export default function Page({ params }: { params: { slug: string } }) {
  const { slug } = params
  return <h1>Post: {slug}</h1>
}
```

You wrote this the way you would have in Next.js 14. Visit `/blog/hello`. What happens in each of:
(a) `next build`, (b) `next dev`: terminal and browser, (c) the production server. Be specific about errors vs. warnings
vs. silence.

## Q6. Predict

In Next.js 14 this page was rendered once at build time and cached. Now:

```tsx
// app/page.tsx
async function getPosts() {
  const res = await fetch('https://api.vercel.app/blog')
  return res.json() as Promise<{ id: number; title: string }[]>
}

export default async function Page() {
  const posts = await getPosts()
  return <ul>{posts.map((p) => <li key={p.id}>{p.title}</li>)}</ul>
}
```

What does `next build` do? Name every fix the framework could reasonably offer you.

## Q7. Spot the bug

```tsx
// app/page.tsx
export default function Page() {
  return <p>Rendered at {new Date().toISOString()}</p>
}
```

This is a plain synchronous component with no `fetch`. Does it build? If not, why, and what are your options?

## Q8. Spot the bug

```tsx
// app/page.tsx
import { cookies } from 'next/headers'

async function getTheme() {
  'use cache'
  return (await cookies()).get('theme')?.value ?? 'light'
}

export default async function Page() {
  const theme = await getTheme()
  return <p>{theme}</p>
}
```

What goes wrong and why is it a rule rather than a bug? How would you restructure it?

## Q9. Spot the bug

```ts
// app/api/posts/route.ts
import { revalidateTag, updateTag } from 'next/cache'

export async function POST() {
  // ... insert the post ...
  revalidateTag('posts')
  updateTag('posts')
  return Response.json({ ok: true })
}
```

There are two separate problems. For each: what is it, and does it surface at `next build` or only when the route is hit?
Then: which of these two APIs gives read-your-own-writes, and where is it allowed?

## Q10. Predict

```tsx
// app/posts/page.tsx
async function getPosts() {
  const res = await fetch('https://api.vercel.app/blog')
  return res.json() as Promise<{ id: number; title: string }[]>
}
export default async function Page() {
  const posts = await getPosts()
  return <ul>{posts.map((p) => <li key={p.id}>{p.title}</li>)}</ul>
}
```
```tsx
// app/posts/loading.tsx
export default function Loading() { return <p>Loading posts…</p> }
```

Compared with Q6, the only change is `loading.tsx`. Does `next build` pass? If so, what HTML does the prerendered
`/posts` contain, and when do the posts arrive?
