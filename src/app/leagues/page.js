'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function CreateLeague() {
  const [leagueName, setLeagueName] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState(null)

  const createLeague = async () => {
    setLoading(true)
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    
    const { data, error } = await supabase
      .from('leagues')
      .insert([{ name: leagueName, invite_code: code }])
      .select()

    if (error) {
      alert('Error creating league: ' + error.message)
    } else {
      setInviteCode(code)
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold text-white mb-8">Create a League</h1>
      
      {!inviteCode ? (
        <div className="flex flex-col gap-4 w-80">
          <input
            type="text"
            placeholder="League name"
            value={leagueName}
            onChange={(e) => setLeagueName(e.target.value)}
            className="bg-zinc-800 text-white px-4 py-3 rounded-lg outline-none"
          />
          <button
            onClick={createLeague}
            disabled={loading || !leagueName}
            className="bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create League'}
          </button>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-zinc-400 mb-2">Your invite code is</p>
          <p className="text-5xl font-bold text-white tracking-widest">{inviteCode}</p>
          <p className="text-zinc-500 mt-4 text-sm">Share this with your friends to join</p>
        </div>
      )}
    </main>
  )
}