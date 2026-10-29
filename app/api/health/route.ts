import { sql } from 'drizzle-orm'
import { db } from '@/db/client'

export async function GET() {
  const checkedAt = new Date().toISOString()
  try {
    const { rows } = await db.execute<{ server_version: string }>(sql`show server_version`)
    return Response.json({ status: 'ok', database: 'up', serverVersion: rows[0].server_version, checkedAt }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('health check failed', error)
    
    return Response.json({ status: 'error', database: 'down', checkedAt }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}