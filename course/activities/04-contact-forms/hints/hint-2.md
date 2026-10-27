# A04 · Hint 2 (narrows the approach)

**Validation.** One schema (Zod is installed) used by both actions. Trim first, then check length, then check the shape of the email; turn an empty email into "no email". Return
`safeParse` problems as a `{ field: message }` object. Remember the action receives *strings* from `FormData`, possibly `null` for a missing field.

**The state.** Something like `{ status: 'idle' | 'ok' | 'error', values: { name, email }, fieldErrors?: { name?, email? }, message? }`, defined in a normal module (a `'use server'` file may only export async functions).
The form uses `values` as the inputs' `defaultValue`s: after an error they hold what was typed, after a success they are empty. That is how both "keep" and "clear" work with React's automatic form reset.

**Binding.** The page does `createContactAction.bind(null, orgSlug)`; the action's first parameter is then the slug, followed by `(previousState, formData)`. Bound values are input like everything else: the
action calls `requireRole(orgSlug, 'rep')` itself.

**The unique violation.** Let the database be the judge (a "check first, then insert" has a gap between the two steps). Catch the error from `createContact`. Drizzle wraps what the driver throws,
so the five-character SQLSTATE is **not** on the error you catch; follow the error's `cause`. `23505` is a unique violation. Everything else: `console.error` it and return a generic message.

**Invalidation.** Read the four pages once more with this question: *which one is meant to be called from a Server Action, and what does it promise about the page that the same action returns?*
Call it after a successful write and before you return. The tag is the cached function's tag.

**The cached total.** A function with `'use cache'` at its top, `cacheTag(...)`, and optionally `cacheLife(...)`. Its arguments are its key: give it what differs between organisations.
It can sit next to the component that renders the total; it must not call `requireRole` itself (the request is not available inside).

**Pending.** `useActionState` returns a third value. **Not found.** In the edit page, `notFound()` when `getContact` gives null. **Redirect.** `redirect()` works by throwing a special error; where must it *not* be?

**Experiments.** X1 and X2: use `npm run typecheck`, `npm run build`, and `npm run dev` (open `/scratch`), and read the first lines of each output.
