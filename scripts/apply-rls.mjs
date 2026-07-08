/**
 * Applies migration 007_rls_policies.sql to the live Supabase DB.
 * Run: node scripts/apply-rls.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Credentials come from .env.local — never hardcode keys in scripts.
const __env = (await import('fs')).readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const __SUPABASE_URL     = __env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const __SERVICE_ROLE_KEY = __env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const __ANON_KEY         = __env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim()


const __dir = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL     = __SUPABASE_URL
const SERVICE_ROLE_KEY = __SERVICE_ROLE_KEY

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
          // sb_secret keys are not JWTs — send via apikey only, never Bearer
          'apikey': SERVICE_ROLE_KEY,
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
