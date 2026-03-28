'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UtensilsCrossed } from 'lucide-react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(false)
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    if (res.ok) {
      const data = await res.json()
      // Truck staff go straight to truck inventory
      if (data.role === 'lc_truck' || data.role === 'salem_truck') {
        router.push('/truck-inventory')
      } else {
        router.push('/dashboard')
      }
      router.refresh()
    } else {
      setError(true)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-amber-800 rounded-2xl">
              <UtensilsCrossed className="w-10 h-10 text-amber-200" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Momo on the Wheels</h1>
          <p className="text-stone-400 text-sm mt-1">Operations System</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-stone-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              className="w-full px-4 py-3 bg-stone-700 text-white rounded-xl border border-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-600 placeholder-stone-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-4 py-3 bg-stone-700 text-white rounded-xl border border-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-600 placeholder-stone-500"
            />
          </div>
          {error && (
            <p className="text-red-400 text-sm text-center">Invalid username or password</p>
          )}
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-3 bg-amber-700 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-stone-600 text-xs mt-6">v1.0 · Momo on the Wheels</p>
      </div>
    </div>
  )
}
