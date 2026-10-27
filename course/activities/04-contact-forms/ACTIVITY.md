# A04 · Create and edit contacts

> **Phase 1 · Feature · Level L1 (guided) · about 4.5 h**
> Needs: A03 done. This is the first activity with **browser tests**: Chromium must start (A01.1 checks it).

## The ticket

**From:** Sam Whitfield, Support Lead
**Subject:** Reps want to add and fix contacts without leaving the list

> The list is great. Now the reps want to *change* it, and these are the tickets Support has already collected from the beta:
>
> - "I typed a phone number into the email box, it said 'Something went wrong' and I lost everything I had typed."
> - "I added a contact, the number at the top of the page didn't change. I added her again. Now there are two Marias."
> - "It showed me a message about a 'unique constraint' and some SQL. I'm not a robot."
> - "I misspelled a name and there's no way to fix it."
>
> What I need: an **Add contact** form at the top of the contacts list, and a way to **edit** a contact. Names are required; emails are
> optional but must look like emails, and two contacts in the same organisation can't share one (Acme can use the same address as Kestrel; they're different customers). When something's wrong, say what
> and where, in plain words, and **keep what the person typed**. When it works, the list and the total at the top are right *straight away*.
> The total ("30,019 contacts") is read on every page view by everyone in the organisation, so don't ask the database to count 30,000 rows each time.

## What you will learn

- **Server Actions**: what they are (a public HTTP endpoint with a friendly name), what runs where, and why everything they receive is untrusted.
- **Validation** on the server, and error handling that a person can act on, with no database text on screen.
- `useActionState`: the form, the action and the state that comes back; pending state; why typed values vanish and how to keep them.
- **Caching with tags** (`use cache`, `cacheTag`) and **invalidation**: the same number for everyone, but never wrong after a write.
- **Where mistakes surface** (the habit your diagnostic showed you need): editor, `tsc`, `next build`, dev server, browser.

## Before you start

- A03 done. Skim `lib/dal/contacts.ts`: `countContacts`, `createContact`, `getContact`, `updateContact` are stubs with the contract in their signatures.
- Read in your repo (about 30 minutes): `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, `09-revalidating.md`, and the guide
  `02-guides/forms.md`; then the API pages `updateTag.md`, `revalidateTag.md`, `revalidatePath.md` and `refresh.md` in `03-api-reference/04-functions/`.
- Read `components/auth-form.tsx` to see how a client-side form looks when it does *not* use a Server Action. You are about to do it the other way.

## The mechanism

### A Server Action is an HTTP endpoint

```
 browser                                            server
 ───────                                            ──────
 <form action={formAction}>  ── POST <page URL> ──►  Next finds the function by an id sent in a header (Next-Action)
   [Add contact]                multipart form data   runs it (requireRole → validate → write → invalidate)
                  ◄── the return value, plus the re-rendered page ──
```

- It is *reachable by anyone* who can send that request, with any form data they like. So an action does what a Route Handler must do too: find out **who is asking and for
  which organisation**, **validate** what it received, and answer in a way the caller can use. A `required` attribute in the HTML is a courtesy, not a check.
- What it **returns** is what the form shows next. With `useActionState(action, initialState)` the action gets `(previousState, formData)` and returns the next state.
- Arguments you `bind` (such as the organisation slug) are part of the request too. Treat them as input.
- Inside a `'use server'` file every export is a public entry point. Keep helpers elsewhere.

### The form lifecycle, and a React 19 surprise

When an action finishes, React **resets an uncontrolled form to its default values**. If the action returns an error, the fields are reset and the user's text is gone, unless the *defaults*
themselves come from the state the action returned. Think about what state you return so that "keep what was typed" and "clear after success" are both true.

### What the action's answer contains

When an action invalidates cached data, the response it sends back already contains the re-rendered page, so the person who clicked sees the new data without a second round trip. *Which* invalidation function you call
decides whether that re-render uses fresh or stale data. The four you will read about are not interchangeable (`revalidatePath`, `revalidateTag`, `updateTag`, `refresh`). Test A04.6 will tell you if you picked one that shows an old total.

### Caching the total

The total is the same for everyone in an organisation, so it is a good candidate for `use cache`. Two rules from the caching guide matter here:

- a cached function cannot read the request (`cookies()`, `params`…); the runtime values it needs go in as **arguments**, and they become part of the **cache key**;
- a cache entry has a **tag**; invalidating the tag expires every entry that carries it.

Decide where the cached function lives (the DAL function itself is plain SQL on purpose, so the tests can call it outside a request) and what its key must contain so that Kestrel's total can never be served to Acme.

### Errors you decide how to show

A unique-constraint violation is a database event with a SQLSTATE (A02 listed them). Your action turns a *kind* of error into a sentence for the person; anything else goes to the server log and the person gets a generic, safe message.

## Do this first: two experiments (about 25 minutes)

Your diagnostic showed one miscalibration: *when* a boundary mistake surfaces. Write `docs/notes/a04-predictions.md` with this table filled with guesses **before** you run anything, then fill the "actual" column.

| Variant | editor (red squiggle) | `npm run typecheck` | `npm run build` | `npm run dev` + open the page | browser |
| --- | --- | --- | --- | --- | --- |
| X1 a function prop passed from a Server Component to a Client Component | | | | | |
| X2 a Client Component that imports `@/db/client` | | | | | |

```tsx
// X1:  components/scratch-button.tsx
'use client'
export function ScratchButton({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick}>go</button>
}
// app/scratch/page.tsx   (no directive: a Server Component)
import { ScratchButton } from '@/components/scratch-button'
export default function Page() {
  return <ScratchButton onClick={() => console.log('hi')} />
}

// X2:  components/scratch-button.tsx
'use client'
import { db } from '@/db/client'
export function ScratchButton() {
  return <button onClick={() => void db}>go</button>
}
```

Delete `app/scratch` and `components/scratch-button.tsx` afterwards. Compare. For each cell that surprised you, write the sentence "I thought ___ but the mechanism is ___".

## Requirements

1. **Total.** On the contacts list, an element whose whole text is `<number> contacts` (for example `482 contacts`, thousands separated by commas). It is cached with a tag, and
   it is correct on the page an action answers and on any request after it.
2. **Add form** on the contacts list: a form with the accessible name **Add contact** (`aria-label`), labelled fields **Name** and **Email**, and a submit button named **Add contact**.
   - Name: required, trimmed, at most 200 characters. Email: optional, trimmed, at most 320 characters, must look like an email; an empty email means "no email".
   - Each error appears **next to its field** in an element with `role="alert"`, and the field gets `aria-invalid="true"`. Typed values are kept after an error and cleared after success.
   - A duplicate email in the organisation (compared ignoring case) is refused in plain words: no SQL, no error text, no constraint name on screen. The same address in another organisation is fine.
   - While the action runs, the button is disabled.
   - Success happens **on the same page**: same URL, no reload, the new contact is the first row, the total is right.
3. **Edit page** at `/<org>/contacts/<contactId>/edit`: a form named **Edit contact**, the same two fields prefilled, a **Save** button, the same rules. Saving without changes is fine.
   After a successful save you are back on the list. In the list each contact's name is a link to its edit page. An unknown or foreign id shows the not-found page.
4. **Data access** in `lib/dal/contacts.ts`: `countContacts`, `createContact`, `getContact`, `updateContact`, keeping the signatures.
   They work only inside `ctx.orgId`; nothing in the input can choose the organisation; a malformed id is "not found", not a database error; a duplicate email is *not* hidden by the DAL (the
   database's refusal reaches the caller, who decides what to say). `createContact` does not set an owner yet (owners arrive with roles in A07).
5. **Validation lives in one place** that the add and edit actions share (a `lib/validation/…` module of your choice).
6. **The experiments** above, with `docs/notes/a04-predictions.md`.

## Acceptance criteria

Run `npm run act -- 4`. Data-access tests run in-process; the form tests drive a real Chromium against the production build. They use the organisations `lumen` and `kestrel`.

| Test | What it checks |
| --- | --- |
| A04.1 | `createContact` adds exactly one contact to the context's organisation, whatever the input says. |
| A04.2 | `getContact`/`updateContact` see only that organisation; `updated_at` moves forward. |
| A04.3 | A malformed id is "not found", not an error. |
| A04.4 | `countContacts` equals `count(*)` and costs one query. |
| A04.5 | A duplicate email (any case) is refused by the database; another organisation may use it. |
| A04.6 | **Browser:** a valid contact is added on the same page: total +1 *on that page*, new row first, form empty, no reload. |
| A04.7 | A new request receives the new total at once (the cached count is invalidated, not left to expire). |
| A04.8 | Invalid input is refused next to the field (`role="alert"`, `aria-invalid`), nothing is written, typed values are kept. |
| A04.9 | A duplicate email is refused in plain words, with no database text on screen; another organisation may use the address. |
| A04.10 | While the action runs the button is disabled; afterwards it works again. |
| A04.11 | The total is cached: two page views run at most one count query. |
| A04.12 | Each name in the list links to `/<org>/contacts/<id>/edit`. |
| A04.13 | Editing works; unchanged save works; invalid and duplicate input are refused as in the add form; a successful save ends on the list. |

## Messages you may meet

- X1 (verified on this project): `tsc` and the editor are **silent**. `next build` fails while prerendering the page:
  `Error occurred prerendering page "/scratch"` … `Error: Event handlers cannot be passed to Client Component props. {onClick: function onClick}`. The dev server answers the request with **HTTP 500** and prints the same error
  in the terminal. In none of these does the browser ever get a page to hydrate.
- X2 (verified): `tsc` is silent; `next build` fails with two messages for `db/client.ts`. The first one misleadingly says "…you are using it in the Pages Router"; the useful one is
  `'server-only' cannot be imported from a Client Component module`.
- A test failing with `expected 1431 to be 1432` on "the total on THIS page, right after the action": your page showed the *old* total.
- A test failing with `Timeout 8000ms exceeded` in `page.waitForURL`: something that should have navigated did not.

## Stretch goals

- Two experiments on double submits (name only, no email). First click **Add contact** twice by hand, as fast as you can. Then, in the browser console, run
  `const b = document.querySelector('form[aria-label="Add contact"] button[type=submit]'); b.click(); b.click()`. How many contacts did each give you, and why is `disabled={pending}` not the whole answer? (A13 fixes it properly; for now, just observe it.)
- Move focus to the first invalid field after an error, so keyboard and screen-reader users land where the problem is.
- Add a third state to the form: "Saved" confirmation that disappears. Where does that state belong?
- Show the same contact form in a dialog without losing the same-page behaviour.

## Self-review checklist

- [ ] I can explain why `required` on the input is not validation, and what an attacker who skips the page can send to my action.
- [ ] I know which of the four invalidation functions my action uses and can say why the others would have shown the old total on this page.
- [ ] My cached function takes everything that makes the answer different as an argument; Kestrel's total cannot be served to Acme.
- [ ] No `error.message` of a database error reaches the browser. I know where the SQLSTATE is on the error object Drizzle throws.
- [ ] `redirect()` is outside every `try/catch` in my actions, and I can explain why.
- [ ] I filled in the prediction table before running X1 and X2, and wrote a sentence for every surprise.

## Official docs

- Next.js (in your repo): `01-app/01-getting-started/07-mutating-data.md`, `09-revalidating.md`; guides `forms.md`, `server-actions.md`, `data-security.md`
- API: `03-api-reference/04-functions/updateTag.md`, `revalidateTag.md`, `revalidatePath.md`, `refresh.md`, `cacheTag.md`, `cacheLife.md`; directives `use-cache.md`, `use-server.md`
- React `useActionState`: <https://react.dev/reference/react/useActionState>
- Zod: <https://zod.dev/api>
- PostgreSQL error codes: <https://www.postgresql.org/docs/18/errcodes-appendix.html>

## Stuck?

Hints are in [`hints/`](hints/). Give each 15 minutes. `npm run solution 4` prints the reference solution; read it **after** your own attempt.
