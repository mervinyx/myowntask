"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { Settings } from "lucide-react"
import TaskList from "@/components/TaskList"
import Calendar from "@/components/Calendar"
import CalendarSettingsModal from "@/components/CalendarSettingsModal"
import { DndContext, DragOverlay, DragEndEvent } from "@dnd-kit/core"
import { useDraggable } from "@dnd-kit/core"
import { addDays, setHours, setMinutes } from "date-fns"
import type { Session } from "next-auth"

interface Task {
  id: string
  title: string
  description: string | null
  priority: "HIGH" | "MEDIUM" | "LOW"
  dueDate: string | null
  scheduledAt: string | null
  duration: number | null
  completed: boolean
}

interface ExternalEvent {
  id: string
  title: string
  startAt: string
  endAt: string
  isAllDay: boolean
}

export default function MainPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [tasks, setTasks] = useState<Task[]>([])
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [view, setView] = useState<"month" | "week" | "day">("month")
  const [currentDate, setCurrentDate] = useState(new Date())
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    if (status === "authenticated") {
      fetchTasks()
      fetchExternalEvents()
    }
  }, [status])

  const fetchTasks = async () => {
    try {
      const response = await fetch("/api/tasks")
      if (response.ok) {
        const data = await response.json()
        setTasks(data)
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error)
    }
  }

  const fetchExternalEvents = async () => {
    try {
      const response = await fetch("/api/external-events")
      if (response.ok) {
        const data = await response.json()
        setExternalEvents(data)
      }
    } catch (error) {
      console.error("Failed to fetch external events:", error)
    }
  }

  const handleCreateTask = async (data: any) => {
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (response.ok) {
        fetchTasks()
      }
    } catch (error) {
      console.error("Failed to create task:", error)
    }
  }

  const handleToggleComplete = async (id: string) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !task.completed }),
      })
      if (response.ok) {
        fetchTasks()
      }
    } catch (error) {
      console.error("Failed to update task:", error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        fetchTasks()
      }
    } catch (error) {
      console.error("Failed to delete task:", error)
    }
  }

  const handleDropTask = useCallback(async (taskId: string, date: Date, time?: string) => {
    let scheduledAt: Date

    if (time) {
      const [hours, minutes] = time.split(":").map(Number)
      scheduledAt = setHours(setMinutes(date, minutes), hours)
    } else {
      scheduledAt = setHours(setMinutes(date, 0), 9)
    }

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: scheduledAt.toISOString() }),
      })
      if (response.ok) {
        fetchTasks()
      }
    } catch (error) {
      console.error("Failed to schedule task:", error)
    }
  }, [])

  const handleDragBack = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: null }),
      })
      if (response.ok) {
        fetchTasks()
      }
    } catch (error) {
      console.error("Failed to unschedule task:", error)
    }
  }, [])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || !active) return

    const activeData = active.data.current as any
    const overData = over.data.current as any

    if (activeData?.type === "task" && overData?.type === "date") {
      handleDropTask(active.id as string, overData.date)
    } else if (activeData?.type === "task" && overData?.type === "time") {
      handleDropTask(active.id as string, overData.date, `${overData.hour}:00`)
    }
  }

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id as string)
  }

  const handleViewChange = (newView: "month" | "week" | "day") => {
    setView(newView)
  }

  const handlePrevious = () => {
    if (view === "month") setCurrentDate((d) => addDays(d, -30))
    if (view === "week") setCurrentDate((d) => addDays(d, -7))
    if (view === "day") setCurrentDate((d) => addDays(d, -1))
  }

  const handleNext = () => {
    if (view === "month") setCurrentDate((d) => addDays(d, 30))
    if (view === "week") setCurrentDate((d) => addDays(d, 7))
    if (view === "day") setCurrentDate((d) => addDays(d, 1))
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-screen bg-white">
        <aside className="w-96 border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h1 className="text-lg font-medium text-gray-900">TaskFlow</h1>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-gray-500">{session.user?.email}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="text-gray-500 hover:text-gray-700"
                  title="CalDAV Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
          <TaskList
            tasks={tasks}
            onToggleComplete={handleToggleComplete}
            onDelete={handleDelete}
            onUpdate={(id, data) => {
              if (id) {
                fetch(`/api/tasks/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(data),
                }).then((res) => {
                  if (res.ok) fetchTasks()
                })
              } else {
                handleCreateTask(data)
              }
            }}
          />
        </aside>
        <main className="flex-1 flex flex-col">
          <Calendar
            view={view}
            currentDate={currentDate}
            tasks={tasks}
            externalEvents={externalEvents}
            onViewChange={handleViewChange}
            onDropTask={handleDropTask}
            onDragBack={handleDragBack}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onToday={handleToday}
          />
        </main>
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="p-3 bg-white border border-gray-200 rounded shadow-lg border-l-4 max-w-xs">
            <div className="text-sm font-medium text-gray-900">{activeTask.title}</div>
            {activeTask.description && (
              <div className="text-xs text-gray-500 mt-1">{activeTask.description}</div>
            )}
          </div>
        ) : null}
      </DragOverlay>
      <CalendarSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSyncComplete={() => {
          fetchTasks()
          fetchExternalEvents()
        }}
      />
    </DndContext>
  )
}
