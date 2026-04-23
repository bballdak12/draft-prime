'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../../lib/supabase'

export default function Dashboard() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold text-white mb-2">Welcome to Draft Prime</h1>
      {user && (
        <p className="text-zinc-400 mb-8">{user.email}</p>
      )}
      <div className="flex flex-col gap-4 w-80">
        <a href="/leagues" className="bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 text-center">
          Create a League
        </a>
        <a href="/join" className="bg-zinc-800 text-white font-bold py-3 rounded-lg hover:bg-zinc-700 text-center">
          Join a League
        </a>
        <button
          onClick={handleSignOut}
          className="text-zinc-500 text-sm hover:text-white mt-4"
        >
          Sign Out
        </button>
      </div>
    </main>
  )
}