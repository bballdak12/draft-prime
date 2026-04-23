'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function JoinLeague() {
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)

  const joinLeague = async () => {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('leagues')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase())
      .single()

    if (error || !data) {
      setError('Invalid invite code. Please check and try again.')
    } else {
      setSuccess(data.name)
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold text-white mb-2">Join a League</h1>
      <p className="text-zinc-400 mb-8 text-sm">Enter the invite code your commissioner shared</p>

      {!success ? (
        <div className="flex flex-col gap-4 w-80">
          <input
            type="text"
            placeholder="Enter invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            maxLength={6}
            className="bg-zinc-800 text-white px-4 py-3 rounded-lg outline-none uppercase tracking-widest text-center text-xl"
          />
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
          <button
            onClick={joinLeague}
            disabled={loading || inviteCode.length < 6}
            className="bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Join League'}
          </button>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-zinc-400 mb-2">You're joining</p>
          <p className="text-4xl font-bold text-white mb-6">{success}</p>
          <button className="bg-white text-black font-bold py-3 px-8 rounded-lg hover:bg-zinc-200">
            Continue
          </button>
        </div>
      )}
    </main>
  )
}