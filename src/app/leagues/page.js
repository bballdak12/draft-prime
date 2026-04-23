'use client'

import { useState } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function CreateLeague() {
  const [leagueName, setLeagueName] = useState('')
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState(null)
  const [error, setError] = useState(null)
  const router = useRouter()

  const createLeague = async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to create a league.')
      setLoading(false)
      return
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase()

    const { data: league, error: leagueError } = await supabase
      .from('leagues')
      .insert([{ name: leagueName, invite_code: code, created_by: user.id }])
      .select()
      .single()

    if (leagueError) {
      setError('Error creating league: ' + leagueError.message)
      setLoading(false)
      return
    }

    const { error: memberError } = await supabase
      .from('league_members')
      .insert([{ league_id: league.id, user_id: user.id, is_commissioner: true }])

    if (memberError) {
      setError('League created but could not add you as commissioner: ' + memberError.message)
      setLoading(false)
      return
    }

    setCreated({ id: league.id, inviteCode: code, name: leagueName })
    setLoading(false)
  }

  if (created) {
    return (
      <main style={{ backgroundColor: '#0A0E1A' }} className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">League Created!</h2>
          <p className="text-zinc-400 mb-6">Share this invite code with your league mates</p>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-10 py-6 mb-8 inline-block">
            <p className="text-zinc-400 text-sm mb-2">Invite Code</p>
            <p className="text-5xl font-bold tracking-widest" style={{ color: '#F0B429' }}>
              {created.inviteCode}
            </p>
          </div>
          <div className="flex flex-col gap-3 w-64 mx-auto">
            <button
              onClick={() => router.push(`/leagues/${created.id}`)}
              className="font-bold py-3 rounded-lg"
              style={{ backgroundColor: '#F0B429', color: '#0A0E1A' }}
            >
              Go to League
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-zinc-800 text-white font-bold py-3 rounded-lg hover:bg-zinc-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={{ backgroundColor: '#0A0E1A' }} className="min-h-screen flex flex-col items-center justify-center px-4">
      <h1 className="text-4xl font-bold text-white mb-2">Create a League</h1>
      <p className="text-zinc-400 mb-8 text-sm">You'll be the commissioner</p>

      <div className="flex flex-col gap-4 w-80">
        <input
          type="text"
          placeholder="League name"
          value={leagueName}
          onChange={(e) => setLeagueName(e.target.value)}
          className="bg-zinc-800 text-white px-4 py-3 rounded-lg outline-none"
        />
        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}
        <button
          onClick={createLeague}
          disabled={loading || !leagueName}
          className="font-bold py-3 rounded-lg disabled:opacity-50"
          style={{ backgroundColor: '#F0B429', color: '#0A0E1A' }}
        >
          {loading ? 'Creating...' : 'Create League'}
        </button>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-zinc-500 text-sm hover:text-white"
        >
          Back to Dashboard
        </button>
      </div>
    </main>
  )
}
