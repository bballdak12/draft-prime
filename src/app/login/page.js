'use client'

import { useState } from 'react'
import { createClient } from '../../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState(null)

  const supabase = createClient()

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const handleEmailAuth = async () => {
    setLoading(true)
    setError(null)

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) setError(error.message)
      else setError('Check your email to confirm your account.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) setError(error.message)
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold text-white mb-2">Draft Prime</h1>
      <p className="text-zinc-400 mb-8 text-sm">
        {isSignUp ? 'Create your account' : 'Sign in to your account'}
      </p>

      <div className="flex flex-col gap-4 w-80">

        <button
          onClick={handleGoogle}
          className="bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 flex items-center justify-center gap-2"
        >
          <span>Sign in with Google</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-zinc-700" />
          <span className="text-zinc-500 text-sm">or</span>
          <div className="flex-1 h-px bg-zinc-700" />
        </div>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-zinc-800 text-white px-4 py-3 rounded-lg outline-none"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-zinc-800 text-white px-4 py-3 rounded-lg outline-none"
        />

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        <button
          onClick={handleEmailAuth}
          disabled={loading || !email || !password}
          className="bg-zinc-800 text-white font-bold py-3 rounded-lg hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
        </button>

        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="text-zinc-400 text-sm hover:text-white"
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>

      </div>
    </main>
  )
}