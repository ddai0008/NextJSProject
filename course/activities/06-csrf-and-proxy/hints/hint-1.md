# A06 · Hint 1 (a nudge)

**Reproduce before you fix.** For #1 you can see the leak with `curl` and no cookie; for #2 you can send the forged header yourself. Seeing the bad behaviour first tells you what "fixed" looks like and gives you a test you can run in ten seconds.

**Ask one question of every door, in turn: "if `proxy.ts` did not exist, what would stop a stranger here?"** Pages, endpoints, Server Actions. Write the answer next to each. Where the answer is "nothing", that is where the work is.

**CSRF.** What can a *browser* tell you about a request that the *page's script* cannot fake? Two headers, both in the table in the ticket. Which one is present when? What should you do when neither is?

**The gate and the matcher.** The proxy runs for the paths its `matcher` selects. Read the documented examples. For each path your app has (`/`, `/login`, `/api/...`, `/kestrel/contacts`, `/_next/...`), say whether your matcher lets the proxy run. Is that what you want for each? Which do you want to protect with the proxy, and which must protect themselves?

**Don't build one big switch.** The export endpoint needs its own check. The auth endpoints need the same-site check. The pages need `requireRole` to ask for a session. The proxy needs only a cookie's *presence*. Four small, separate decisions.

**Before you run anything:** write down how many of the 17 tests you expect to pass, and which ones you expect to fail only in the "without proxy.ts" groups.
