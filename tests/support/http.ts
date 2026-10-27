import { env } from './env'
import { sql } from './db'

export type Role = 'admin' | 'manager' | 'rep'
export const PASSWORD = 'correct horse battery staple'

export type Signed = { email: string; userId: string | null; cookie: string | null; orgSlug: string; role: Role }

type RequestOptions = {
  cookie?: string | null
  method?: string
  headers?: Record<string, string>
  body?: BodyInit | null
  json?: unknown
  redirect?: RequestRedirect
  base?: string
  /** Do not add the default `Origin` header to a non-GET request (to test what a server does with a request that has none). */
  omitOrigin?: boolean
}

/** A request to the running app. Redirects are NOT followed unless asked: a test usually wants to see the 307. */
export async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const base = options.base ?? env.baseUrl()
  const method = options.method ?? (options.json !== undefined || options.body ? 'POST' : 'GET')
  const headers: Record<string, string> = { ...options.headers }
  if (options.cookie) headers.cookie = options.cookie
  if (options.json !== undefined) headers['content-type'] = 'application/json'
  if (method !== 'GET' && method !== 'HEAD' && headers.origin === undefined && !options.omitOrigin) headers.origin = base
  return fetch(`${base}${path}`, {
    method,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    redirect: options.redirect ?? 'manual',
  })
}

export const cookieHeaderOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')

const authAvailable = new Map<string, boolean>()

/**
 * Does the app have the A05 auth contract yet? Tests written for earlier activities must keep passing after A05, when pages start
 * asking for a session, so they sign in when they can and go without when there is nothing to sign in to.
 */
export async function hasAuth(base: string = env.baseUrl()): Promise<boolean> {
  if (!authAvailable.has(base)) {
    const response = await request('/api/auth/register', { method: 'POST', json: {}, base })
    authAvailable.set(base, response.status !== 404)
  }
  return authAvailable.get(base)!
}

let counter = 0

/** A fresh user who is a member of `orgSlug` with `role`, signed in through the public auth contract (when it exists). */
export async function signIn(orgSlug: string, role: Role = 'admin', base: string = env.baseUrl()): Promise<Signed> {
  const email = `act-${Date.now().toString(36)}-${counter++}-${Math.random().toString(36).slice(2, 8)}@act.test`
  if (!(await hasAuth(base))) return { email, userId: null, cookie: null, orgSlug, role }
  const registered = await request('/api/auth/register', { json: { email, name: 'Act Test', password: PASSWORD }, base })
  if (registered.status !== 201) throw new Error(`POST /api/auth/register answered ${registered.status}: ${await registered.text()}. The contract is in the A05 ticket.`)
  const { id } = (await registered.json()) as { id: string }
  await sql('insert into memberships (org_id, user_id, role) select id, $2, $3 from orgs where slug = $1', [orgSlug, id, role])
  const login = await request('/api/auth/login', { json: { email, password: PASSWORD }, base })
  if (login.status !== 200) throw new Error(`POST /api/auth/login answered ${login.status}: ${await login.text()}`)
  return { email, userId: id, cookie: cookieHeaderOf(login), orgSlug, role }
}
