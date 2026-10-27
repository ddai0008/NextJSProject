import { expect as pw, type Browser, type BrowserContext } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { launchBrowser } from '../../support/browser'
import { sql } from '../../support/db'
import { env } from '../../support/env'
import { signIn } from '../../support/http'
import { seeded } from '../../support/people'

// The edit form is still offered for a contact you may see; the ACTION decides. A refused change must say so in words, not crash, and not write.

let browser: Browser
let context: BrowserContext
let userId: string

beforeAll(async () => {
  browser = await launchBrowser()
  context = await browser.newContext()
  const session = await signIn('acme', 'rep')
  userId = session.userId!
  const base = env.baseUrl()
  await context.addCookies(session.cookie!.split('; ').map((pair) => ({ name: pair.slice(0, pair.indexOf('=')), value: pair.slice(pair.indexOf('=') + 1), url: base })))
})
afterAll(async () => {
  await context?.close()
  await browser?.close()
})

async function openEdit(contactId: string) {
  const page = await context.newPage()
  await page.goto(`${env.baseUrl()}/acme/contacts/${contactId}/edit`)
  const form = page.getByRole('form', { name: 'Edit contact' })
  await form.waitFor()
  await page.waitForFunction(() => {
    const f = document.querySelector('form[aria-label="Edit contact"]')
    return !!f && Object.keys(f).some((key) => key.startsWith('__reactProps'))
  })
  return { page, form }
}

describe('A07 refused changes in the browser', () => {
  test('A07.15 a rep who edits someone else\'s contact is told no, in words, and nothing is written; their own contact saves', async () => {
    const [theirs] = await sql<{ id: string }>(
      `insert into contacts (org_id, owner_id, name, email) select o.id, u.id, 'Someone Elses', $1 from orgs o, users u where o.slug = 'acme' and u.email = $2 returning id`,
      [`other.${Date.now().toString(36)}@example.test`, seeded.acme.otherRep],
    )
    const { page, form } = await openEdit(theirs.id)
    await form.getByLabel('Name', { exact: true }).fill('Hijacked by a rep')
    await form.getByRole('button', { name: 'Save' }).click()
    await pw(form.getByRole('alert').first(), 'a message').toBeVisible({ timeout: 8000 })
    expect(await form.getByRole('alert').first().innerText(), 'says it is not allowed').toMatch(/not allowed|cannot|can.?t|permission|only .*(owner|manager)/i)
    expect(await page.innerText('body'), 'no internal error text on screen').not.toMatch(/ForbiddenError|Error:|at async/)
    expect((await sql<{ name: string }>('select name from contacts where id = $1', [theirs.id]))[0].name).toBe('Someone Elses')
    await page.close()

    const [mine] = await sql<{ id: string }>('insert into contacts (org_id, owner_id, name, email) select o.id, $1, $2, $3 from orgs o where o.slug = $4 returning id', [userId, 'Mine Before', `mine.${Date.now().toString(36)}@example.test`, 'acme'])
    const own = await openEdit(mine.id)
    await own.form.getByLabel('Name', { exact: true }).fill('Mine After')
    await own.form.getByRole('button', { name: 'Save' }).click()
    await own.page.waitForURL(new RegExp(`/acme/contacts(\\?.*)?$`), { timeout: 8000 })
    expect((await sql<{ name: string }>('select name from contacts where id = $1', [mine.id]))[0].name).toBe('Mine After')
    await own.page.close()
  })
})
