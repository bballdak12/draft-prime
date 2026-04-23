'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../../lib/supabase'

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [leagues, setLeagues] = useState([])
  const [loading, setLoading] = useState(true)
  const [debugError, setDebugError] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      console.log('[Dashboard] user:', user?.id)
      setUser(user)

      if (!user) {
        setLoading(false)
        return
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from('league_members')
        .select('league_id, is_commissioner')
        .eq('user_id', user.id)

      console.log('[Dashboard] memberships:', memberships)
      console.log('[Dashboard] membershipsError:', membershipsError)

      if (membershipsError) {
        setDebugError(membershipsError.message)
        setLoading(false)
        return
      }

      if (!memberships || memberships.length === 0) {
        setLoading(false)
        return
      }

      const leagueIds = memberships.map(m => m.league_id)

      const { data: leagueData, error: leagueError } = await supabase
        .from('leagues')
        .select('id, name, status, invite_code')
        .in('id', leagueIds)

      console.log('[Dashboard] leagueData:', leagueData)
      console.log('[Dashboard] leagueError:', leagueError)

      if (leagueError) {
        setDebugError(leagueError.message)
        setLoading(false)
        return
      }

      const merged = leagueData.map(league => ({
        ...league,
        is_commissioner: memberships.find(
          m => m.league_id === league.id
        )?.is_commissioner
      }))

      console.log('[Dashboard] merged:', merged)
      setLeagues(merged)
      setLoading(false)
    }

    fetchData()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-zinc-400">Loading your leagues...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      <h1 className="text-4xl font-bold text-white mb-2">
        Welcome to Draft Prime
      </h1>
      {user && (
        <p className="text-zinc-400 mb-8">{user.email}</p>
      )}

      {debugError && (
        <div className="bg-red-900 text-red-200 px-4 py-3 rounded-lg mb-6 w-80 text-sm">
          Error: {debugError}
        </div>
      )}

      {leagues.length > 0 ? (
        <div className="flex flex-col gap-4 w-80">
          {leagues.map(league => (
            <a
              key={league.id}
              href={"/leagues/" + league.id}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-5 py-4 hover:border-zinc-500 transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-white font-bold">{league.name}</span>
                {league.is_commissioner && (
                  <span className="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded">
                    Commissioner
                  </span>
                )}
              </div>
              <span className="text-zinc-500 text-sm capitalize">
                {league.status}
              </span>
            </a>
          ))}
          <a
            href="/leagues"
            className="bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 text-center mt-2"
          >
            Create Another League
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-4 w-80">
          <a
            href="/leagues"
            className="bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 text-center"
          >
            Create a League
          </a>
          <a
            href="/join"
            className="bg-zinc-800 text-white font-bold py-3 rounded-lg hover:bg-zinc-700 text-center"
          >
            Join a League
          </a>
        </div>
      )}

      <button
        onClick={handleSignOut}
        className="text-zinc-500 text-sm hover:text-white mt-8"
      >
        Sign Out
      </button>
    </main>
  )
}
