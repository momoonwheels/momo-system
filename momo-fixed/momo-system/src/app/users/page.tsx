'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { UserPlus, Trash2, Edit2, Check, X, Eye, EyeOff } from 'lucide-react'

const ROLES = [
  { value: 'manager',    label: '🏭 Manager (Newport)', desc: 'Full access to all pages' },
  { value: 'lc_truck',  label: '🚚 Lincoln City Truck', desc: 'Truck Inventory only' },
  { value: 'salem_truck',label: '🚚 Salem Truck',       desc: 'Truck Inventory only' },
]

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string|null>(null)
  const [showPw, setShowPw] = useState<Record<string,boolean>>({})
  const [form, setForm] = useState({ username:'', password:'', role:'manager', location_id:'' })
  const [editForm, setEditForm] = useState<any>({})

  const load = async () => {
    const [usersRes, locsRes] = await Promise.all([
      fetch('/api/auth-users').then(r=>r.json()),
      import('@/lib/supabase').then(({supabase}) =>
        supabase.from('locations').select('*').eq('active',true)
      )
    ])
    setUsers(Array.isArray(usersRes) ? usersRes : [])
    setLocations(locsRes.data||[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const addUser = async () => {
    if (!form.username || !form.password) return toast.error('Username and password required')
    const res = await fetch('/api/auth-users', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(form)
    })
    if (res.ok) { toast.success('User added!'); setShowAdd(false); setForm({username:'',password:'',role:'manager',location_id:''}); load() }
    else {
      const err = await res.json()
      toast.error(err.error || 'Failed to add user')
    }
  }

  const saveEdit = async (id: string) => {
    const res = await fetch('/api/auth-users', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, ...editForm })
    })
    if (res.ok) { toast.success('Updated!'); setEditId(null); load() }
    else toast.error('Failed to update')
  }

  const deleteUser = async (id: string, username: string) => {
    if (!confirm(`Delete user "${username}"?`)) return
    const res = await fetch(`/api/auth-users?id=${id}`, { method:'DELETE' })
    if (res.ok) { toast.success('User deleted'); load() }
    else toast.error('Failed to delete')
  }

  const toggleActive = async (user: any) => {
    const res = await fetch('/api/auth-users', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: user.id, role: user.role, active: !user.active, location_id: user.location_id })
    })
    if (res.ok) { toast.success(user.active ? 'User deactivated' : 'User activated'); load() }
  }

  const roleLabel = (role: string) => ROLES.find(r=>r.value===role)?.label || role
  const roleColor = (role: string) => role==='manager' ? 'bg-brand-100 text-brand-800' : 'bg-blue-100 text-blue-800'

  if (loading) return <LoadingSpinner />

  return (
    <div className="p-8">
      <PageHeader
        title="User Management"
        sub="Manage who can access the system and what they can see"
        action={
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">
            <UserPlus className="w-4 h-4" />
            Add User
          </button>
        }
      />

      {/* Add User Form */}
      {showAdd && (
        <Card className="mb-6 border-2 border-brand-200">
          <h3 className="font-semibold text-gray-900 mb-4">New User</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input type="text" value={form.username}
                onChange={e => setForm(p=>({...p,username:e.target.value}))}
                placeholder="e.g. john_lc"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="text" value={form.password}
                onChange={e => setForm(p=>({...p,password:e.target.value}))}
                placeholder="Set a password"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Role & Access</label>
            <div className="grid grid-cols-3 gap-3">
              {ROLES.map(r => (
                <button key={r.value} onClick={() => setForm(p=>({...p,role:r.value}))}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    form.role===r.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <div className="text-sm font-medium text-gray-800">{r.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={addUser} className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700">Add User</button>
          </div>
        </Card>
      )}

      {/* Users Table */}
      <Card className="p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-brand-900 text-white">
              <th className="text-left px-6 py-3 text-sm font-medium">Username</th>
              <th className="text-center px-4 py-3 text-sm font-medium">Role</th>
              <th className="text-center px-4 py-3 text-sm font-medium">Password</th>
              <th className="text-center px-4 py-3 text-sm font-medium">Status</th>
              <th className="text-center px-4 py-3 text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, i) => (
              <tr key={user.id} className={i%2===0?'bg-white':'bg-gray-50'}>
                <td className="px-6 py-3">
                  <div className="font-medium text-gray-800">{user.username}</div>
                  {user.locations?.name && <div className="text-xs text-gray-400">{user.locations.name}</div>}
                </td>
                <td className="px-4 py-3 text-center">
                  {editId === user.id ? (
                    <select value={editForm.role}
                      onChange={e => setEditForm((p:any)=>({...p,role:e.target.value}))}
                      className="text-xs border border-gray-200 rounded px-2 py-1">
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColor(user.role)}`}>
                      {roleLabel(user.role)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {editId === user.id ? (
                    <input type="text" placeholder="New password (leave blank to keep)"
                      onChange={e => setEditForm((p:any)=>({...p,password:e.target.value}))}
                      className="text-xs border border-gray-200 rounded px-2 py-1 w-40" />
                  ) : (
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-xs text-gray-500 font-mono">
                        {showPw[user.id] ? user.password_hash : '••••••••'}
                      </span>
                      <button onClick={() => setShowPw(p=>({...p,[user.id]:!p[user.id]}))}
                        className="p-0.5 text-gray-400 hover:text-gray-600">
                        {showPw[user.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleActive(user)}
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      user.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                    {user.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {editId === user.id ? (
                      <>
                        <button onClick={() => saveEdit(user.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditId(user.id); setEditForm({role:user.role,active:user.active,location_id:user.location_id}) }}
                          className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteUser(user.id, user.username)}
                          className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="text-center py-12 text-gray-400">No users yet. Add your first user!</div>
        )}
      </Card>
    </div>
  )
}
