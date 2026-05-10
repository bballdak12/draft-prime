/**
 * Applies migration 007_rls_policies.sql to the live Supabase DB.
 * Run: node scripts/apply-rls.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL     = 'https://hihbgpkjrzffdzuiqzcp.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpaGJncGtqcnpmZmR6dWlxemNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjczNzEwNywiZXhwIjoyMDkyMzEzMTA3fQ.P_juXzfqA0JaHxatEE82rpmJ75Gy-yi82gYgoCKCrDI'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: { schema: 'public' },
  auth: { persistSession: false },
})

const sql = readFileSync(join(__dir, '../supabase/migrations/007_rls_policies.sql'), 'utf8')

// Split on semicolons and run each statement individually
// (Supabase REST doesn't support multi-statement queries)
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'))

console.log(`\n🔐 Applying RLS policies (${statements.length} statements)…\n`)

let passed = 0
let failed = 0

for (const stmt of statements) {
  const preview = stmt.slice(0, 80).replace(/\n/g, ' ')
  try {
    const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' })
    if (error) {
      // Try via direct REST query endpoint as fallback
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ sql: stmt + ';' }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`)
    }
    console.log(`  ✅ ${preview}…`)
    passed++
  } catch (err) {
    console.log(`  ❌ ${preview}…`)
    console.log(`     ${err.message}`)
    failed++
  }
}

console.log(`\n${failed === 0 ? '✅ All statements applied' : `⚠️  ${failed} failed, ${passed} passed`}\n`)
