'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../../../lib/supabase'
import { useParams, useRouter } from 'next/navigation'

export default function LeaguePage() {
  const { id } = useParams()
  const router = useRouter()
  const [league, setLeague] = useState(null)
  const [members, setMembers] = useState([])
  const [currentUserId, setCurrentUserId] = useState(null)
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setCurrentUserId(user.id)

      // Fetch league details
      const { data: leagueData, error: leagueError } = await supabase
        .from('leagues')
        .select('*')
        .eq('id', id)
        .single()

      console.log('[League] leagueData:', leagueData, 'error:', leagueError)

      if (leagueError || !leagueData) {
        setError('League not found.')
        setLoading(false)
        return
      }
      setLeague(leagueData)

      // Step 1: fetch membership rows for this league
      // Note: RLS must allow reading all members in leagues you belong to,
      // not just your own row. Run the SECURITY DEFINER SQL fix if this
      // returns only 1 row instead of all members.
      const { data: memberRows, error: memberRowsError } = await supabase
        .from('league_members')
        .select('user_id, is_commissioner, joined_at')
        .eq('league_id', id)
        .order('joined_at')

      console.log('[League] memberRows:', memberRows, 'error:', memberRowsError)

      if (memberRowsError) {
        setError('Could not load members: ' + memberRowsError.message)
        setLoading(false)
        return
      }

      if (!memberRows || memberRows.length === 0) {
        setLoading(false)
        return
      }

      // Step 2: fetch profiles for those user IDs separately
      // (cannot use embedded join — league_members.user_id FK points to
      //  auth.users, not profiles, so PostgREST can't resolve profiles(...))
      const userIds = memberRows.map(m => m.user_id)
      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, team_name')
        .in('id', userIds)

      console.log('[League] profileRows:', profileRows, 'error:', profilesError)

      // Build a lookup map so we can merge in O(n)
      const profileMap = {}
      profileRows?.forEach(p => { profileMap[p.id] = p })

      const merged = memberRows.map(m => ({
        user_id: m.user_id,
        is_commissioner: m.is_commissioner,
        joined_at: m.joined_at,
        display_name: profileMap[m.user_id]?.display_name || 'Unknown',
        team_name: profileMap[m.user_id]?.team_name || '—',
      }))

      console.log('[League] merged members:', merged)
      setMembers(merged)

      const me = merged.find(m => m.user_id === user.id)
      if (me) setIsCommissioner(me.is_commissioner)

      setLoading(false)
    }
    load()
  }, [id])

  const copyInviteCode = () => {
    navigator.clipboard.writeText(league.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <main style={{ backgroundColor: '#0A0E1A' }} className="min-h-screen flex items-center justify-center">
        <p className="text-zinc-400">Loading...</p>
      </main>
    )
  }

  if (error) {
    return (
      <main style={{ backgroundColor: '#0A0E1A' }} className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error}</p>
        <button onClick={() => router.push('/dashboard')} className="text-zinc-400 hover:text-white text-sm">
          Back to Dashboard
        </button>
      </main>
    )
  }

  const memberCount = members.length

  return (
    <main style={{ backgroundColor: '#0A0E1A' }} className="min-h-screen px-4 py-8">
      <div className="max-w-lg mx-auto">

        <button
          onClick={() => router.push('/dashboard')}
          className="text-zinc-400 hover:text-white text-sm mb-6 block"
        >
          ← Dashboard
        </button>

        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">{league.name}</h1>
            <p className="text-zinc-400 text-sm mt-1 capitalize">
              {league.status} · {memberCount} / 12 members
            </p>
          </div>
          {isCommissioner && (
            <span
              className="text-xs font-bold px-2 py-1 rounded shrink-0"
              style={{ backgroundColor: '#F0B429', color: '#0A0E1A' }}
            >
              Commissioner
            </span>
          )}
        </div>

        {/* Invite code — shown prominently until league is full */}
        {memberCount < 12 && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 mb-6">
            <p className="text-zinc-400 text-sm mb-3">Invite friends to join</p>
            <div className="flex items-center justify-between gap-4">
              <p className="text-3xl font-bold tracking-widest" style={{ color: '#F0B429' }}>
                {league.invite_code}
              </p>
              <button
                onClick={copyInviteCode}
                className="text-sm px-4 py-2 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 shrink-0"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Commissioner controls */}
        {isCommissioner && (
          <div className="mb-6">
            <button
              disabled={memberCount < 2}
              className="w-full font-bold py-4 rounded-xl text-lg disabled:opacity-40"
              style={{ backgroundColor: '#F0B429', color: '#0A0E1A' }}
            >
              {memberCount < 2 ? 'Need at least 2 members to start' : 'Start Draft'}
            </button>
          </div>
        )}

        {/* Members list */}
        <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">
          Members ({memberCount}/12)
        </h2>
        <div className="flex flex-col gap-2">
          {members.map(member => (
            <div
              key={member.user_id}
              className="bg-zinc-900 rounded-xl px-4 py-3 flex items-center justify-between"
            >
              <div>
                <p className="text-white font-medium">{member.display_name}</p>
                <p className="text-zinc-500 text-sm">{member.team_name}</p>
              </div>
              <div className="flex items-center gap-2">
                {member.is_commissioner && (
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{ backgroundColor: '#F0B429', color: '#0A0E1A' }}
                  >
                    Commish
                  </span>
                )}
                {member.user_id === currentUserId && (
                  <span className="text-xs text-zinc-600">You</span>
                )}
              </div>
            </div>
          ))}

          {/* Empty slots for remaining spots */}
          {Array.from({ length: 12 - memberCount }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="border border-dashed border-zinc-800 rounded-xl px-4 py-3"
            >
              <p className="text-zinc-700 text-sm">Empty slot</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
