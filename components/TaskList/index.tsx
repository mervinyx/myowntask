"use client"

import { useState } from "react"
import { Trash2, Check } from "lucide-react"
import { useDraggable } from "@dnd-kit/core"

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

interface TaskListProps {
  tasks: Task[]
  onToggleComplete: (id: string) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, data: any) => void
}

function DraggableTask({ task, children }: { task: Task; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: task.id,
    data: { type: "task", task },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.5 : 1, cursor: "grab" }}
    >
      {children}
    </div>
  )
}

export default function TaskList({ tasks, onToggleComplete, onDelete, onUpdate }: TaskListProps) {
  const unscheduledTasks = tasks.filter((task) => !task.scheduledAt && !task.completed)
  const scheduledTasks = tasks.filter((task) => task.scheduledAt && !task.completed)
  const completedTasks = tasks.filter((task) => task.completed)

  const [showCompleted, setShowCompleted] = useState(false)

  const priorityColors = {
    HIGH: "border-l-red-500",
    MEDIUM: "border-l-yellow-500",
    LOW: "border-l-blue-500",
  }

  const formatTime = (date: string) => {
    const d = new Date(date)
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const renderTask = (task: Task, draggable: boolean = true) => {
    const taskElement = (
      <div
        className={`p-3 bg-white border border-gray-200 rounded border-l-4 ${priorityColors[task.priority]} hover:border-gray-300 transition-colors ${
          task.completed ? "opacity-50" : ""
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onToggleComplete(task.id)}
                className={`w-4 h-4 rounded border flex items-center justify-center ${
                  task.completed ? "bg-gray-900 border-gray-900" : "border-gray-400"
                }`}
              >
                {task.completed && <Check size={10} className="text-white" />}
              </button>
              <h3 className={`text-sm font-medium ${task.completed ? "line-through text-gray-500" : "text-gray-900"}`}>
                {task.title}
              </h3>
            </div>
            {task.description && (
              <p className="text-xs text-gray-500 mt-1 ml-6">{task.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 ml-6">
              {task.dueDate && (
                <span className="text-xs text-gray-400">Due: {formatDate(task.dueDate)}</span>
              )}
              {task.scheduledAt && (
                <>
                  <span className="text-xs text-gray-400">→</span>
                  <span className="text-xs text-gray-600">{formatTime(task.scheduledAt)}</span>
                  {formatDate(task.scheduledAt) !== formatDate(new Date().toISOString()) && (
                    <span className="text-xs text-gray-400">({formatDate(task.scheduledAt)})</span>
                  )}
                </>
              )}
              {task.duration && (
                <>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-400">{task.duration}min</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={() => onDelete(task.id)}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    )

    if (draggable) {
      return <DraggableTask task={task}>{taskElement}</DraggableTask>
    }

    return taskElement
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-sm font-medium text-gray-900 mb-3">Add Task</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.currentTarget)
            const title = formData.get("title") as string
            if (title.trim()) {
              onUpdate("", {
                title: title.trim(),
                priority: (formData.get("priority") as string) || "MEDIUM",
                duration: 60,
              })
              e.currentTarget.reset()
            }
          }}
          className="space-y-2"
        >
          <input
            name="title"
            type="text"
            placeholder="Add a task..."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
            autoFocus
          />
          <div className="flex gap-2">
            <select
              name="priority"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM" selected>Medium</option>
              <option value="HIGH">High</option>
            </select>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800 transition-colors"
            >
              Add
            </button>
          </div>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <section>
          <h3 className="text-xs font-medium text-gray-500 mb-2">
            Unscheduled ({unscheduledTasks.length})
          </h3>
          <div className="space-y-2">
            {unscheduledTasks.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No unscheduled tasks</p>
            ) : (
              unscheduledTasks.map((task) => renderTask(task))
            )}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-medium text-gray-500 mb-2">
            Scheduled ({scheduledTasks.length})
          </h3>
          <div className="space-y-2">
            {scheduledTasks.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No scheduled tasks</p>
            ) : (
              scheduledTasks.map((task) => renderTask(task))
            )}
          </div>
        </section>

        {completedTasks.length > 0 && (
          <section>
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="w-full flex items-center justify-between text-xs font-medium text-gray-500 mb-2 hover:text-gray-700"
            >
              <span>Completed ({completedTasks.length})</span>
              <span>{showCompleted ? "▼" : "▶"}</span>
            </button>
            {showCompleted && (
              <div className="space-y-2">
                {completedTasks.map((task) => renderTask(task, false))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
