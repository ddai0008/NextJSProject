# A07 · Hint 1 (a nudge)

**Start from the matrix, not from the code.** If you have not written `docs/notes/a07-matrix.md` yet, write it now. Most wrong implementations here come from a matrix that lived only in the author's head. The tests' own matrix is in the comment at the top of `tests/activities/07-dal-and-roles/dal.test.ts`; compare it with yours *after* you wrote yours.

**Work in this order**, so each step has tests that can fail for the right reason:

1. `requireRole` (A07.16, A07.17). It is small, and everything else depends on what it returns. It answers three questions in turn: *signed in? member of this organisation? role high enough?* Each question has its own "no", and they are three different "no"s.
2. The contacts you already have (A07.1, A07.3), then the two stubs in `contact-admin.ts` (A07.2, A07.4).
3. Deals, then members (A07.5 to A07.8).
4. The members page and the edit action (A07.10, A07.15).
5. The boundary tests (A07.11 to A07.14) probably tell you where you reached around the layer.

**Two kinds of "no".** For each refusal, ask: *does this caller already know the row exists?* If they are in the organisation and could see the row, "forbidden, and here is why" helps them. If the row belongs to someone else's customer, any answer other than "nothing there" tells a stranger something.

**The context is the only identity.** Look at the signature of every DAL function: `(ctx, ...)`. Nothing else may tell the function *who is acting* or *for which organisation*. If you find yourself adding an `orgId` or `userId` parameter, stop: the context already has it, and a parameter is a way for a caller to pass the wrong one.

**Read the failure text first.** The role tests print a line like `the owner (a rep): …` or `a rep of another organisation: …`. That label names the cell of the matrix you got wrong.

**Before you run anything:** write down how many of the 17 tests you expect to pass on the first run, and which cell of the matrix you are least sure of. (Not zero: the four boundary tests, A07.11 to A07.14, pass already. They are guards: they will fail the moment a shortcut you write reaches around the layer.)
