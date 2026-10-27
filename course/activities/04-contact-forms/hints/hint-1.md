# A04 · Hint 1 (a nudge)

**Draw the round trip first.** Browser → action → database → back to the browser. At each arrow, write down who controls the input and what could be wrong with it. The action is
the only place where "wrong" can be stopped, so that is where the rules live.

**Start with the data, then the action, then the form.** Tests A04.1 to A04.5 only need the four functions in `lib/dal/contacts.ts`; do those first. Then the add action and its form
(A04.6 to A04.11), then the edit page (A04.12, A04.13).

**What does the form need back from the action?** Make a list: success or failure; which field is wrong and why; what to show in the fields now; a message that does not belong to a field.
That list is the shape of the state `useActionState` carries.

**The total.** Two questions. (1) Who needs this number and is it the same for all of them? (2) What event makes it wrong, and what is the *first* moment someone can see the wrong number? If the answer to the
second question is "the page my own action answers", then the order of things inside the action matters.

**Failures to read carefully.**
- `expected 1431 to be 1432` on A04.6: the total on the page you just submitted from is one behind. Which of the four invalidation functions did you use?
- `Timeout … waitForURL` on A04.13: after a successful save the browser should have moved. What would stop a `redirect()` from taking effect?
- A04.9 says the screen contains database text: look at what you put into the message, and where the information you want actually is on the error you caught.

**Before you run anything:** write down how many of the 13 tests you expect to pass.
