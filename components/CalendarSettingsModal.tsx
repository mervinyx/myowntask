"use client"

import { useState, useEffect } from "react"
import { X, RefreshCw, Trash2, Settings } from "lucide-react"

interface CalendarAccount {
  id?: string
  name: string
  serverUrl: string
  username: string
  color: string
  lastSyncedAt?: string | null
}

interface CalendarSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSyncComplete?: () => void
}

export default function CalendarSettingsModal({
  isOpen,
  onClose,
  onSyncComplete,
}: CalendarSettingsModalProps) {
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [account, setAccount] = useState<CalendarAccount | null>(null)
  
  const [formData, setFormData] = useState({
    name: "",
    serverUrl: "",
    username: "",
    password: "",
    color: "#3b82f6",
  })

  const colors = [
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#d946ef",
  ]

  useEffect(() => {
    if (isOpen) {
      fetchAccount()
    } else {
      setError(null)
    }
  }, [isOpen])

  const fetchAccount = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/calendar-account")
      if (res.ok) {
        const data = await res.json()
        if (data) {
          setAccount(data)
          setFormData({
            name: data.name || "",
            serverUrl: data.serverUrl || "",
            username: data.username || "",
            password: "",
            color: data.color || "#3b82f6",
          })
        } else {
          setAccount(null)
          setFormData({
            name: "",
            serverUrl: "",
            username: "",
            password: "",
            color: "#3b82f6",
          })
        }
      }
    } catch (err) {
      console.error("Failed to fetch calendar account", err)
      setError("Failed to load account details")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch("/api/calendar-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        throw new Error("Failed to save settings")
      }

      await fetchAccount()
      if (onSyncComplete) onSyncComplete()
    } catch (err) {
      console.error(err)
      setError("Failed to save settings. Please check your credentials.")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to remove this calendar account?")) return

    try {
      setLoading(true)
      const res = await fetch("/api/calendar-account", {
        method: "DELETE",
      })

      if (!res.ok) {
        throw new Error("Failed to delete account")
      }

      setAccount(null)
      setFormData({
        name: "",
        serverUrl: "",
        username: "",
        password: "",
        color: "#3b82f6",
      })
      if (onSyncComplete) onSyncComplete()
    } catch (err) {
      console.error(err)
      setError("Failed to delete account")
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    try {
      setSyncing(true)
      const res = await fetch("/api/sync", {
        method: "POST",
      })

      if (!res.ok) {
        throw new Error("Sync failed")
      }

      await fetchAccount()
      if (onSyncComplete) onSyncComplete()
    } catch (err) {
      console.error(err)
      setError("Sync failed. Check connection.")
    } finally {
      setSyncing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden border border-gray-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-medium text-gray-900">CalDAV Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 rounded border border-red-100">
              {error}
            </div>
          )}

          {loading && !account && !formData.name ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Calendar"
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900 placeholder:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Server URL
                </label>
                <input
                  type="url"
                  required
                  value={formData.serverUrl}
                  onChange={(e) => setFormData({ ...formData, serverUrl: e.target.value })}
                  placeholder="https://caldav.example.com"
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900 placeholder:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={account ? "••••••••" : ""}
                  required={!account}
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900 placeholder:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: c })}
                      className={`w-6 h-6 rounded-full border transition-all ${
                        formData.color === c
                          ? "ring-2 ring-offset-2 ring-gray-900 border-transparent"
                          : "border-gray-200 hover:scale-110"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {account && (
                <div className="pt-2 flex items-center justify-between text-xs text-gray-500 border-t border-gray-100">
                  <span>
                    Last synced:{" "}
                    {account.lastSyncedAt
                      ? new Date(account.lastSyncedAt).toLocaleString()
                      : "Never"}
                  </span>
                  {syncing && (
                    <span className="flex items-center gap-1 text-blue-600">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Syncing...
                    </span>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2 mt-6">
                {account ? (
                  <>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="px-4 py-2 text-sm text-red-600 border border-gray-200 rounded hover:bg-red-50 hover:border-red-200 transition-colors flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={handleSync}
                      disabled={syncing}
                      className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded hover:bg-gray-50 transition-colors flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                      Sync
                    </button>
                  </>
                ) : (
                  <div className="flex-1" />
                )}
                
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
