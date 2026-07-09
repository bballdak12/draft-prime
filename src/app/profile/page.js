'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase'
import ProfileView from './ProfileView'

const GOLD = '#F0B429'

function Spinner() {
  return (
    <main style={{ backgroundColor: '#0A0E1A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #1A2035', borderTopColor: GOLD, animation: 'spin 0.8s linear infinite' }} />
    </main>
  )
}

export default function OwnProfilePage() {
  const router = useRouter()
  const [uid, setUid] = useState(null)

  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
      else setUid(user.id)
    })
  }, [router])

  if (!uid) return <Spinner />
  return (
    <Suspense fallback={<Spinner />}>
      <ProfileView userId={uid} />
    </Suspense>
  )
}
