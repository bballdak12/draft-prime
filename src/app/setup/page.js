'use client'

import { useState } from 'react'
import { createClient } from '../../lib/supabase'

export default function Setup() {
  const [displayName, setDisplayName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSetup = async () => {
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        team_name: teamName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      setError(error.message)
    } else {
      window.location.href = '/dashboard'
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold text-white mb-2">Set Up Your Profile</h1>
      <p className="text-zinc-400 mb-8 text-sm">Tell us who you are before we hit the field</p>

      <div className="flex flex-col gap-4 w-80">
        <div>
          <label className="text-zinc-400 text-sm mb-1 block">Your Name</label>
          <input
            type="text"
            placeholder="How your friends will see you"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="bg-zinc-800 text-white px-4 py-3 rounded-lg outline-none w-full"
          />
        </div>

        <div>
          <label className="text-zinc-400 text-sm mb-1 block">Team Name</label>
          <input
            type="text"
            placeholder="What's your team called?"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="bg-zinc-800 text-white px-4 py-3 rounded-lg outline-none w-full"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        <button
          onClick={handleSetup}
          disabled={loading || !displayName || !teamName}
          className="bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Enter Draft Prime'}
        </button>
      </div>
    </main>
  )
}