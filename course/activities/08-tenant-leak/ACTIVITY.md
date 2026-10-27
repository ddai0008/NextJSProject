# A08 · Kestrel Solar can see Acme's contacts

> **Phase 1 · Incident · Level L3 (behaviour and constraints) · about 3 h**
> Needs: A07 done. Like A06, this activity starts from code that already exists in the product: you fetch it with `npm run start-activity -- 8`.

## The ticket

**From:** Tomás Reyes, Customer Success (Kestrel Solar account)
**Subject:** Privacy report from Kestrel's IT admin: they could open an Acme contact
**Forwarded:** Jun Park, CTO: "Priority. Read it twice."

> Kestrel's IT admin, Wendell Ng, wrote:
>
> "While testing your mobile app I replaced the last part of a contact link with one that a colleague at Acme Freight (a partner of ours) had pasted into a chat. I could see their contact: name, email, company. I did not change anything. I am reporting it because I could have."
>
> Support reproduced it on the contact page *and* on the mobile endpoint. Nobody has checked anything else.
>
> Jun's addition: "We finished the roles work last week and it holds. These pages predate it: the mobile release and the 'quick rename' form were written by a contractor before there was a `RequestContext`. I don't want a fix that patches the one link Wendell tried. Find every path that does this, fix it where the mistake is made, and give me tests that would catch the *next* one. Legal needs a one-page account of what happened. Not found, not forbidden: we don't confirm to Kestrel that Acme's contact exists."

## What you will learn

- **IDOR / broken object-level authorization**: you authorized the *container* (the organisation in the URL) and then fetched the *object* (the contact) by its id alone. Why this is the most common serious bug in multi-tenant systems, and why it is invisible in a demo.
- Why **the layer where the query is made** is where the rule must live, and why patching each caller (three of them today) fails the day a fourth is written.
- That **a hidden form field is user input**, and what a Server Action's bound arguments are (and are not).
- Writing a test that catches a **class** of bug, not the instance: a structural rule plus a generic walker over every DAL function.
- Writing the **post-incident account** that someone outside engineering can read.

## Before you start

- A07 done and `npm run act:upto -- 7` green.
- Skim `node_modules/next/dist/docs/01-app/02-guides/data-security.md` (*Authentication and authorization*, *Closures and encryption*) and the OWASP page on object-level authorization (links at the end).

## Step 0: get the code you are about to fix

```bash
npm run start-activity -- 8
```

It adds four files and changes nothing else:

| File | What it is |
| --- | --- |
| `lib/dal/legacy-contacts.ts` | two functions from before `RequestContext` existed |
| `app/(app)/[orgSlug]/contacts/[contactId]/page.tsx` | a contact page with a rename form |
| `app/(app)/[orgSlug]/contacts/[contactId]/actions.ts` | the Server Action behind that form |
| `app/api/orgs/[orgSlug]/contacts/[id]/route.ts` | the mobile app's "open this contact" call |

Read all four as you would at work, with one question for each line that touches the database or the URL: *what has this line established, and about what?*

## Do this first (about 40 minutes)

1. **Run the tests as they are:** `npm run act -- 8`. Eight of the nine fail (A08.7 passes for now: read why when you get to it). That is your reproduction, and the messages say which path leaked what.
2. **See it with your own eyes.** Sign in as a Kestrel user in the browser (register a user, then `npm run psql` and add a row to `memberships` for the `kestrel` organisation, as the tests do). Get an Acme contact id (`npm run psql -- -c "select c.id, c.name from contacts c join orgs o on o.id = c.org_id where o.slug = 'acme' limit 3"`). Open `/kestrel/contacts/<that id>`.
3. **Write the first half of `docs/notes/a08-incident.md` now**, before you fix anything: what happened (in words Wendell would recognise), which paths were affected, and *the one sentence that names the mistake*. 4. **Find the paths the ticket does not name.** Go through the app and list every route that takes an organisation or an id from the request (a path segment, a query string, JSON, a form field), not only the four files you were given. For each: what does it check about the *caller*, and what does it check about the *object*? The ticket says nobody has looked; you are the first to.
5. Predict: how many of the 9 tests will pass when you delete the page's use of `legacy-contacts.ts` and nothing else?

## The mechanism

```
 GET /kestrel/contacts/<ACME's id>                    what the code establishes
  │
  ├─ requireRole('kestrel', 'rep')  ──────────────►  "this person belongs to Kestrel"        ✔ (about the CONTAINER)
  └─ getContactById(<ACME's id>)    ──────────────►  "a row with this id exists"             ✘ (never asked: in WHICH organisation?)
```

The id is not a secret and not an authorization: it is a name. Anyone can be handed one (a pasted link, a log line, an export, a guess). Whether *this person* may see *this row* is a question that has to be asked **again, for the row**, every time.
A07's DAL asks it by construction: every function takes `ctx` and filters by `ctx.orgId`. The legacy module was written before that, so it takes nothing and filters by nothing, and three callers trusted the check that was one line above it.

Two more mechanisms are in play:

- **Hidden form fields.** The rename form carries `orgSlug` and `contactId` as hidden inputs. Whoever holds the form can edit them (browser developer tools, or just writing the POST by hand). The test does exactly that, and it needs no JavaScript: a plain multipart `POST` to the page's URL runs a Server Action.
- **Bound arguments.** `action.bind(null, orgSlug, contactId)` keeps values out of the form: Next.js encrypts them on the way out and checks them on the way back. That removes one way to forge a request. It is a convenience, not the lock: what if the page showed the form for a contact the person may not change?

## Requirements

1. **The page.** `/<org>/contacts/<id>`: if the contact is not in the organisation of the URL, the response is the not-found page and contains none of the contact's data. This holds for a person who belongs to **both** organisations: the organisation in the URL decides.
2. **The mobile endpoint.** `GET /api/orgs/<org>/contacts/<id>`: another organisation's contact answers **404** with no data; your own answers **200** with JSON that includes `name` and `email` (the mobile app reads those); a malformed id answers **404**; no session or a forged one gets no data.
3. **The rename form.** No edit of the form's fields makes it rename a contact of another organisation. The honest form still renames the person's own contact **and keeps its email**. Inside one organisation the A07 rules apply: a rep cannot rename a colleague's contact (not even from the colleague's page), a manager can.
4. **The CSV export.** `GET /api/export/contacts?org=<slug>` (from A06): a member of that organisation gets their CSV exactly as before; anybody else, and an organisation that does not exist, get the same **404** and no rows; no `org` is still 400.
5. **The class.**
   - Every `async` function exported by a module of `lib/dal` (except `session.ts`) takes the `RequestContext` first.
   - Called by a **Kestrel admin** with the ids of Acme's rows (a contact, a company, a deal, a stage, a person), no DAL function that takes an id returns any of Acme's data or changes any of Acme's rows. This is checked for *every* such function, whether or not it existed when you started.
   - Route Handlers other than `app/api/auth/**` and `app/api/health/**` do not import the database: they ask the DAL.
6. **Fix it in the layer where the mistake is made**, not in each caller. You may delete files and add a DAL module.
7. **Do not change the tests.** The legitimate uses are tested too: "switch it off" is not a fix.
8. **The account.** Finish `docs/notes/a08-incident.md` (not tested): what happened, impact (who could see or change what, as far as you can tell from the code), cause (one sentence), the fix, how we will know it cannot recur, and what you could *not* establish.

## Acceptance criteria

Run `npm run act -- 8`, then `npm run act:upto -- 8`.

| Test | What it checks |
| --- | --- |
| A08.1 | A Kestrel member who puts an Acme contact's id into their own organisation's URL gets the not-found page and none of the data; their own contacts still open; a malformed id is not found. |
| A08.2 | The organisation in the URL decides: a person in both organisations sees Acme's contact under `/acme/…` and not under `/kestrel/…`, on the page and on the endpoint. |
| A08.3 | The mobile endpoint: 404 with no data for another organisation's contact, 200 with name and email for your own, 404 for a malformed id, nothing for a stranger. |
| A08.4 | A form edited to name an Acme contact renames nothing; the honest form renames the person's own contact and keeps its email. |
| A08.5 | Inside one organisation the A07 rules apply to the form: a rep cannot rename a colleague's contact (forged or honest), a manager can. |
| A08.6 | Every async function a DAL module exports takes the `RequestContext` first. |
| A08.7 | With the ids of Acme's rows, a Kestrel admin gets back none of their data and changes none of the rows, through every id-taking DAL function. |
| A08.8 | The CSV export: members of the organisation named in `?org=` get their CSV; anybody else gets 404 and no rows, as for an organisation that does not exist. |
| A08.9 | Route Handlers (other than the auth and health endpoints) do not import the database. |

## Messages you may meet

- `Acme's contact in the page: expected [ … ] to deeply equal []`: the page showed the contact. `expected 200 to be 404`: the endpoint did.
- `Acme's contact after the forged form: expected 'Hijacked …' to be 'Acme Secret Contact …'`: the form renamed it.
- `these functions can be called by anyone about anything: give them a context, or make them private`, followed by file and function names: A08.6.
- `a query written in a handler has no context to filter by: move it into lib/dal`, followed by a file name: A08.9. Read that file as the question "what does this handler know about who is asking?".
- `getContact(kestrel admin, contact id of acme) handed back: …` or `… CHANGED rows of acme`: A08.7 names the function and the kind of id that got through.
- `the rename form (aria-label "Rename contact") is on /kestrel/contacts/…`: you removed or renamed the form; the tests find it by that label.
- `Cannot find module '@/lib/dal/legacy-contacts'` after you delete it: good, the compiler found a caller you had not found.

## Stretch goals

- **Ids are not secrets.** This database uses UUIDv7 ids, which begin with a timestamp. What does that make guessable? Would random ids (UUIDv4) have prevented the incident? Write two sentences on why the answer is no.
- **Do not offer what you will refuse.** Hide the rename form from people who may not rename that contact. Which test would need a different way to find the form, and why is that a sign you are testing the wrong thing?
- **Walk the routes as a signed-in stranger.** A06's route walker visits every route as a visitor with no session. Extend the idea: sign in as a Kestrel user and visit every route with Acme's ids filled in. What would it have caught today, and what would it miss?
- **A second wall.** If a future query forgot its `WHERE org_id = …`, what would stop it? (That is A09.)

## Self-review checklist

- [ ] I can say in one sentence what the line `requireRole(orgSlug, 'rep')` does and does not establish.
- [ ] I deleted the unscoped functions instead of adding a parameter to each caller.
- [ ] My fix is in one layer; the three callers got simpler, not longer.
- [ ] I can explain why another organisation's contact answers 404 and a colleague's contact, inside the organisation, answers "forbidden".
- [ ] A hidden field, a cookie, a header, a query string, a path segment: I know which of them I treat as hostile input, and which of my functions still trusts one.
- [ ] `docs/notes/a08-incident.md` says what I could not establish.
- [ ] I looked for paths nobody had listed, and I can name the one I found that was not in the ticket.
- [ ] Before the first run I wrote down how many of the 9 tests I expected to pass.

## Official docs

- Next.js (in your repo): `01-app/02-guides/data-security.md`; `01-app/02-guides/forms.md`; `01-app/03-api-reference/03-file-conventions/route.md`
- OWASP API Security Top 10, *API1:2023 Broken Object Level Authorization* <https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/>
- OWASP Insecure Direct Object Reference Prevention Cheat Sheet <https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html>

## Stuck?

Hints are in [`hints/`](hints/). `npm run solution 8` prints the reference solution; read it **after** your own attempt.
