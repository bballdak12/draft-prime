'use client'

import { useState } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function JoinLeague() {
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState(false)
  const [found, setFound] = useState(null)
  const [error, setError] = useState(null)
  const router = useRouter()

  const findLeague = async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('leagues')
      .select('id, name')
      .eq('invite_code', inviteCode.toUpperCase())
      .single()

    if (error || !data) {
      setError('Invalid invite code. Please check and try again.')
    } else {
      setFound(data)
    }
    setLoading(false)
  }

  const joinLeague = async () => {
    setJoining(true)
    setError(null)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { error } = await supabase
      .from('league_members')
      .insert([{ league_id: found.id, user_id: user.id, is_commissioner: false }])

    if (error) {
      // 23505 = unique violation — user is already a member, just send them there
      if (error.code === '23505') {
        router.push(`/leagues/${found.id}`)
        return
      }
      setError('Could not join league: ' + error.message)
      setJoining(false)
      return
    }

    router.push(`/leagues/${found.id}`)
  }

  return (
    <main style={{ backgroundColor: '#0A0E1A' }} className="min-h-screen flex flex-col items-center justify-center px-4">
      <h1 className="text-4xl font-bold text-white mb-2">Join a League</h1>
      <p className="text-zinc-400 mb-8 text-sm">Enter the invite code your commissioner shared</p>

      {!found ? (
        <div className="flex flex-col gap-4 w-80">
          <input
            type="text"
            placeholder="Enter invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            maxLength={6}
            className="bg-zinc-800 text-white px-4 py-3 rounded-lg outline-none uppercase tracking-widest text-center text-xl"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            onClick={findLeague}
            disabled={loading || inviteCode.length < 6}
            className="font-bold py-3 rounded-lg disabled:opacity-50"
            style={{ backgroundColor: '#F0B429', color: '#0A0E1A' }}
          >
            {loading ? 'Searching...' : 'Find League'}
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-zinc-500 text-sm hover:text-white"
          >
            Back to Dashboard
          </button>
        </div>
      ) : (
        <div className="text-center w-80">
          <p className="text-zinc-400 mb-2">You're joining</p>
          <p className="text-4xl font-bold text-white mb-8">{found.name}</p>
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <div className="flex flex-col gap-3">
            <button
              onClick={joinLeague}
              disabled={joining}
              className="font-bold py-3 rounded-lg disabled:opacity-50"
              style={{ backgroundColor: '#F0B429', color: '#0A0E1A' }}
            >
              {joining ? 'Joining...' : 'Join League'}
            </button>
            <button
              onClick={() => { setFound(null); setError(null) }}
              className="text-zinc-500 text-sm hover:text-white"
            >
              Enter different code
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
