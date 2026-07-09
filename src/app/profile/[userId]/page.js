'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'
import ProfileView from '../ProfileView'

const GOLD = '#F0B429'

function Spinner() {
  return (
    <main style={{ backgroundColor: '#0A0E1A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #1A2035', borderTopColor: GOLD, animation: 'spin 0.8s linear infinite' }} />
    </main>
  )
}

export default function UserProfilePage() {
  const { userId } = useParams()
  return (
    <Suspense fallback={<Spinner />}>
      <ProfileView userId={userId} />
    </Suspense>
  )
}
