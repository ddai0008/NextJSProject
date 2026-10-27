# A08 · Hint 1 (a nudge)

**Reproduce first, and name the pattern.** Run `npm run act -- 8` and read the six failures. For each of the three paths, write down two things: *what was checked* about the caller, and *what was fetched or changed* by the id. If your answers are "the organisation in the URL" and "a row, by its id alone" three times, you have the mistake. Write it as one sentence in `docs/notes/a08-incident.md`.

**The ticket lists two paths. Are there more?** List every route that takes an organisation or an id from the request. For each, write down what it checks about the caller and what it checks about the object. One of them (from A06, and nothing since has touched it) checks only that the caller is signed in. Which one, and what does `?org=<slug>` let a signed-in stranger ask for?

**Who else calls the unscoped functions?** `lib/dal/legacy-contacts.ts` has two functions. Find every file that imports it. Is the list the same as the three paths in the ticket? A fix that handles exactly the paths you were told about is a fix for last week's incident.

**Which layer?** You could add an organisation check to the page, another to the endpoint, another to the action. Count how many places that is, and ask what happens when a fourth caller appears. Then look at `lib/dal/contacts.ts`: is there already a function that cannot be called without saying who is asking, and that filters by the organisation inside the query?

**Hidden fields are user input.** Open the rename form in the browser and look at its inputs. Which of them could you change in the developer tools? What would the server do with the changed value today?

**Order of work:** the page first (A08.1, A08.2), then the mobile endpoint (A08.3), then the form (A08.4, A08.5), then the export (A08.8). The class tests (A08.6, A08.7, A08.9) tell you afterwards whether you left an unscoped door open anywhere else.

**Before you run anything:** write down how many of the 9 tests you expect to pass after you delete the page's use of the legacy module and change nothing else.
