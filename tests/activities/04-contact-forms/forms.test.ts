import { expect as pw, type Browser, type BrowserContext, type Page } from '@playwright/test'
import * as cheerio from 'cheerio'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { launchBrowser } from '../../support/browser'
import { sql } from '../../support/db'
import { env } from '../../support/env'
import { request, signIn } from '../../support/http'
import { callsMatching, resetStatements } from '../../support/statements'

// These tests drive a real browser against the production build. They use the organisations `lumen` and `kestrel` only, so rows written
// by the data-access tests (which bypass the app and therefore its cache) cannot make a total look stale.

const SLUG = 'lumen'
const OTHER = 'kestrel'
let browser: Browser
let context: BrowserContext
let base: string
const unique = (label: string) => `${label}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 6)}@example.test`
const LEAK = /duplicate key|violates|unique constraint|constraint|insert into|DrizzleQueryError|SQLSTATE|failed query|23505|\bat async\b/i

beforeAll(async () => {
  base = env.baseUrl()
  browser = await launchBrowser()
  context = await browser.newContext()
  const { cookie } = await signIn(SLUG, 'admin')
  if (cookie) await context.addCookies(cookie.split('; ').map((pair) => ({ name: pair.slice(0, pair.indexOf('=')), value: pair.slice(pair.indexOf('=') + 1), url: base })))
})
afterAll(async () => {
  await context?.close()
  await browser?.close()
})

const dbCount = async (orgSlug: string) => (await sql<{ n: number }>('select count(*)::int as n from contacts c join orgs o on o.id = c.org_id where o.slug = $1', [orgSlug]))[0].n
const addForm = (page: Page) => page.getByRole('form', { name: 'Add contact' })
const field = (form: ReturnType<typeof addForm>, label: 'Name' | 'Email') => form.getByLabel(label, { exact: true })
const totalOf = async (page: Page) => Number((await page.getByText(/^\s*[\d,]+\s+contacts?\s*$/).first().innerText()).replace(/\D/g, ''))

async function openList(orgSlug = SLUG): Promise<Page> {
  const page = await context.newPage()
  await page.goto(`${base}/${orgSlug}/contacts`)
  await addForm(page).waitFor()
  // React has attached to the form once it carries __reactProps: before that a click is a plain browser form post, not the Server Action.
  await page.waitForFunction(() => {
    const form = document.querySelector('form[aria-label="Add contact"]')
    return !!form && Object.keys(form).some((key) => key.startsWith('__reactProps'))
  })
  return page
}

async function submitAdd(page: Page, values: { name: string; email?: string }) {
  const form = addForm(page)
  await field(form, 'Name').fill(values.name)
  await field(form, 'Email').fill(values.email ?? '')
  await form.getByRole('button', { name: 'Add contact' }).click()
}

describe('A04 the add-contact form', () => {
  test('A04.6 a valid contact is added on the same page: the total goes up by one, the new row is first, the form is empty, nothing reloads', async () => {
    const page = await openList()
    const before = await dbCount(SLUG)
    expect(await totalOf(page), 'the total shown before adding').toBe(before)
    const urlBefore = page.url()
    await page.evaluate(() => ((window as unknown as Record<string, unknown>).__alive = true))
    const name = `Form Test ${Date.now()}`
    await submitAdd(page, { name, email: unique('form') })
    await expect.poll(() => totalOf(page), { timeout: 8000, message: 'the total on THIS page, right after the action' }).toBe(before + 1)
    expect(await dbCount(SLUG)).toBe(before + 1)
    await pw(page.locator('tr[data-contact-id]').first(), 'the newest contact is the first row').toContainText(name)
    await pw(field(addForm(page), 'Name'), 'the form is empty again').toHaveValue('')
    expect(page.url()).toBe(urlBefore)
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__alive), 'the page was not reloaded').toBe(true)
    await page.close()
  })

  test('A04.7 a new request sees the new total at once: the cached count is invalidated, not left to expire', async () => {
    const page = await openList()
    const before = await dbCount(SLUG)
    await submitAdd(page, { name: `Fresh ${Date.now()}`, email: unique('fresh') })
    await expect.poll(() => dbCount(SLUG), { timeout: 8000 }).toBe(before + 1)
    const { cookie } = await signIn(SLUG, 'admin')
    const html = await (await request(`/${SLUG}/contacts`, { cookie })).text()
    const text = cheerio.load(html)('body').text()
    const shown = text.match(/\b([\d,]+)\s+contacts\b/)
    expect(Number(shown?.[1].replace(/,/g, '')), 'the total in the HTML a different client receives').toBe(before + 1)
    await page.close()
  })

  test('A04.8 invalid input is refused next to the field, nothing is written, and what was typed is kept', async () => {
    const before = await dbCount(SLUG)
    const cases = [
      { label: 'empty name', name: '', email: '', invalid: 'Name' as const },
      { label: 'blank name', name: '   ', email: '', invalid: 'Name' as const },
      { label: 'malformed email', name: 'Valid Name', email: 'not-an-email', invalid: 'Email' as const },
      { label: 'name of 300 characters', name: 'x'.repeat(300), email: '', invalid: 'Name' as const },
    ]
    for (const c of cases) {
      const page = await openList()
      const form = addForm(page)
      await form.evaluate((f) => ((f as HTMLFormElement).noValidate = true)) // skip the browser's own checks: the server must say no
      await submitAdd(page, c)
      await pw(form.getByRole('alert').first(), `${c.label}: a message`).toBeVisible()
      await pw(field(form, c.invalid), `${c.label}: ${c.invalid} is marked invalid`).toHaveAttribute('aria-invalid', 'true')
      expect((await field(form, 'Name').inputValue()).trim(), `${c.label}: the name you typed is kept`).toBe(c.name.trim())
      expect(await field(form, 'Email').inputValue(), `${c.label}: the email you typed is kept`).toBe(c.email)
      expect(await dbCount(SLUG), `${c.label}: nothing written`).toBe(before)
      await page.close()
    }
  })

  test('A04.9 a duplicate email is refused in plain words (no SQL, no error text), and another organisation may use it', async () => {
    const email = unique('dup')
    const page = await openList()
    const before = await dbCount(SLUG)
    await submitAdd(page, { name: 'Dup One', email })
    await expect.poll(() => dbCount(SLUG), { timeout: 8000 }).toBe(before + 1)
    await submitAdd(page, { name: 'Dup Two', email: email.toUpperCase() })
    const form = addForm(page)
    await pw(form.getByRole('alert').first()).toBeVisible()
    await pw(field(form, 'Email'), 'Email is marked invalid').toHaveAttribute('aria-invalid', 'true')
    expect(await form.getByRole('alert').first().innerText(), 'says what is wrong').toMatch(/already|exists|in use|taken|duplicate/i)
    expect(await page.innerText('body'), 'no database text on screen').not.toMatch(LEAK)
    expect(await dbCount(SLUG)).toBe(before + 1)
    await page.close()

    const other = await openList(OTHER)
    const otherBefore = await dbCount(OTHER)
    await submitAdd(other, { name: 'Dup In Another Org', email })
    await expect.poll(() => dbCount(OTHER), { timeout: 8000, message: 'the same email is fine in another organisation' }).toBe(otherBefore + 1)
    await other.close()
  })

  test('A04.10 while the action runs the button is disabled; afterwards it works again', async () => {
    const page = await openList()
    await page.route('**/*', async (route) => {
      const req = route.request()
      if (req.method() === 'POST' && req.headers()['next-action']) await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    const form = addForm(page)
    const button = form.getByRole('button', { name: 'Add contact' })
    const before = await dbCount(SLUG)
    await field(form, 'Name').fill(`Slow ${Date.now()}`)
    await field(form, 'Email').fill(unique('slow'))
    await button.click()
    await pw(button, 'disabled while the request is in flight').toBeDisabled({ timeout: 1000 })
    await pw(button, 'enabled again afterwards').toBeEnabled({ timeout: 8000 })
    expect(await dbCount(SLUG)).toBe(before + 1)
    await page.close()
  })

  test('A04.11 the total is cached: two page views run at most one count query', async () => {
    const { cookie } = await signIn(SLUG, 'admin')
    await resetStatements()
    // Read the bodies: the dynamic part of a page is rendered while its response is consumed.
    for (let view = 0; view < 2; view++) await (await request(`/${SLUG}/contacts`, { cookie })).text()
    const calls = await callsMatching((statement) => /count\(\*\)/i.test(statement) && /contacts/i.test(statement) && !/pg_stat_statements|join orgs/i.test(statement))
    expect(calls, 'count queries across two page views (0 or 1 when cached, 2 when not)').toBeLessThanOrEqual(1)
  })
})

describe('A04 the edit page', () => {
  test('A04.12 every name in the list links to /<org>/contacts/<id>/edit', async () => {
    const page = await openList()
    const first = page.locator('tr[data-contact-id]').first()
    const id = await first.getAttribute('data-contact-id')
    await pw(first.locator('a').first()).toHaveAttribute('href', new RegExp(`/${SLUG}/contacts/${id}/edit$`))
    await page.close()
  })

  test('A04.13 editing changes the contact; saving it unchanged works; invalid and duplicate input is refused as in the add form', async () => {
    const email = unique('edit')
    const [created] = await sql<{ id: string }>(
      `insert into contacts (org_id, name, email) select id, 'Edit Me', $1 from orgs where slug = $2 returning id`, [email, SLUG],
    )
    const [taken] = await sql<{ email: string }>(`select c.email from contacts c join orgs o on o.id = c.org_id where o.slug = $1 and c.id <> $2 and c.email is not null limit 1`, [SLUG, created.id])
    const page = await context.newPage()
    const url = `${base}/${SLUG}/contacts/${created.id}/edit`
    const open = async () => {
      await page.goto(url)
      const form = page.getByRole('form', { name: 'Edit contact' })
      await form.waitFor()
      await page.waitForFunction(() => {
        const f = document.querySelector('form[aria-label="Edit contact"]')
        return !!f && Object.keys(f).some((key) => key.startsWith('__reactProps'))
      })
      return form
    }

    let form = await open()
    await pw(field(form, 'Name'), 'the form is filled in').toHaveValue('Edit Me')
    await pw(field(form, 'Email')).toHaveValue(email)

    await form.evaluate((f) => ((f as HTMLFormElement).noValidate = true))
    await field(form, 'Name').fill('')
    await form.getByRole('button', { name: 'Save' }).click()
    await pw(form.getByRole('alert').first(), 'an empty name is refused').toBeVisible()
    expect((await sql<{ name: string }>('select name from contacts where id = $1', [created.id]))[0].name).toBe('Edit Me')

    form = await open()
    await field(form, 'Email').fill(taken.email.toUpperCase())
    await form.getByRole('button', { name: 'Save' }).click()
    await pw(field(form, 'Email'), "another contact's email is refused").toHaveAttribute('aria-invalid', 'true')
    expect(await page.innerText('body')).not.toMatch(LEAK)

    // A successful save takes you back to the list. (redirect() works by throwing: inside a try/catch it is swallowed and nothing happens.)
    const backOnList = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${SLUG}/contacts(\\?.*)?$`)

    form = await open()
    await form.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(backOnList, { timeout: 8000 })
    expect((await sql<{ name: string }>('select name from contacts where id = $1', [created.id]))[0].name, 'saving it unchanged is fine').toBe('Edit Me')

    form = await open()
    const renamed = `Edited ${Date.now()}`
    await field(form, 'Name').fill(renamed)
    await form.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(backOnList, { timeout: 8000 })
    await expect.poll(async () => (await sql<{ name: string }>('select name from contacts where id = $1', [created.id]))[0].name, { timeout: 8000 }).toBe(renamed)
    await page.close()
  })
})
