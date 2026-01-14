"use client"

import { useState } from "react"
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, endOfWeek, isSameDay, isSameMonth } from "date-fns"
import { useDroppable } from "@dnd-kit/core"

interface Task {
  id: string
  title: string
  priority: "HIGH" | "MEDIUM" | "LOW"
  scheduledAt: string | null
  duration: number | null
}

interface ExternalEvent {
  id: string
  title: string
  startAt: string
  endAt: string
  isAllDay: boolean
}

interface CalendarProps {
  view: "month" | "week" | "day"
  currentDate: Date
  tasks: Task[]
  externalEvents?: ExternalEvent[]
  onViewChange: (view: "month" | "week" | "day") => void
  onDropTask: (taskId: string, date: Date, time?: string) => void
  onDragBack: (taskId: string) => void
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
}

function DroppableCell({ id, data, children, className }: { id: string; data: any; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id, data })

  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  )
}

export default function Calendar({
  view,
  currentDate,
  tasks,
  externalEvents = [],
  onViewChange,
  onDropTask,
  onDragBack,
  onPrevious,
  onNext,
  onToday,
}: CalendarProps) {
  const priorityColors = {
    HIGH: "bg-red-50 border-red-200 text-red-700",
    MEDIUM: "bg-yellow-50 border-yellow-200 text-yellow-700",
    LOW: "bg-blue-50 border-blue-200 text-blue-700",
  }

  const externalEventColor = "bg-gray-100 border-gray-300 text-gray-600"

  const getTasksForDate = (date: Date) => {
    return tasks.filter((task) => {
      if (!task.scheduledAt) return false
      return isSameDay(new Date(task.scheduledAt), date)
    })
  }

  const getExternalEventsForDate = (date: Date) => {
    return externalEvents.filter((event) => {
      const eventDate = new Date(event.startAt)
      if (event.isAllDay) {
        return eventDate.getUTCFullYear() === date.getFullYear() &&
               eventDate.getUTCMonth() === date.getMonth() &&
               eventDate.getUTCDate() === date.getDate()
      }
      return isSameDay(eventDate, date)
    })
  }

  const getTasksForDateTime = (date: Date, hour: number) => {
    return tasks.filter((task) => {
      if (!task.scheduledAt) return false
      const taskDate = new Date(task.scheduledAt)
      return isSameDay(taskDate, date) && taskDate.getHours() === hour
    })
  }

  const getExternalEventsForDateTime = (date: Date, hour: number) => {
    return externalEvents.filter((event) => {
      if (event.isAllDay) return false
      const eventDate = new Date(event.startAt)
      return isSameDay(eventDate, date) && eventDate.getHours() === hour
    })
  }

  const formatTime = (date: string) => {
    return format(new Date(date), "HH:mm")
  }

  const MonthView = () => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(monthStart)
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 })
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })
    const days = []

    for (let i = 0; i <= 7; i++) {
      const day = addDays(startDate, i)
      days.push(day)
    }

    const weeks = []
    let week = []

    for (let i = 0; i <= endDate.getTime() - startDate.getTime(); i += 86400000) {
      const day = new Date(startDate.getTime() + i)
      week.push(day)
      if (week.length === 7) {
        weeks.push(week)
        week = []
      }
    }

    if (week.length > 0) {
      weeks.push(week)
    }

    return (
      <div className="grid grid-cols-7 gap-0.5 bg-gray-200 border border-gray-200">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="p-2 text-xs font-medium text-gray-500 bg-white text-center">
            {day}
          </div>
        ))}
        {weeks.map((week, weekIndex) =>
          week.map((day, dayIndex) => {
            const dayTasks = getTasksForDate(day)
            const dayExternalEvents = getExternalEventsForDate(day)
            const isToday = isSameDay(day, new Date())
            const isCurrentMonth = isSameMonth(day, currentDate)
            const allItems = [...dayTasks.map(t => ({ ...t, isExternal: false })), ...dayExternalEvents.map(e => ({ ...e, isExternal: true }))]

            return (
              <DroppableCell
                key={`${weekIndex}-${dayIndex}`}
                id={`date-${day.toISOString()}`}
                data={{ type: "date", date: day }}
                className={`min-h-24 p-2 bg-white border-r border-b border-gray-100 ${
                  !isCurrentMonth ? "bg-gray-50" : ""
                }`}
              >
                <div
                  className={`text-xs font-medium mb-1 ${
                    isToday ? "bg-gray-900 text-white w-6 h-6 rounded-full flex items-center justify-center" : ""
                  } ${!isCurrentMonth ? "text-gray-400" : "text-gray-700"}`}
                >
                  {format(day, "d")}
                </div>
                <div className="space-y-1">
                  {dayTasks.slice(0, 2).map((task) => (
                    <div
                      key={task.id}
                      className={`text-xs p-1 rounded border ${priorityColors[task.priority]} truncate`}
                      title={`${task.title} ${formatTime(task.scheduledAt!)}`}
                    >
                      {formatTime(task.scheduledAt!)} {task.title}
                    </div>
                  ))}
                  {dayExternalEvents.slice(0, 2).map((event) => (
                    <div
                      key={event.id}
                      className={`text-xs p-1 rounded border ${externalEventColor} truncate`}
                      title={`${event.title} (external)`}
                    >
                      {formatTime(event.startAt)} {event.title}
                    </div>
                  ))}
                  {(dayTasks.length + dayExternalEvents.length) > 4 && (
                    <div className="text-xs text-gray-400">+{(dayTasks.length + dayExternalEvents.length) - 4} more</div>
                  )}
                </div>
              </DroppableCell>
            )
          })
        )}
      </div>
    )
  }

  const WeekView = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      days.push(addDays(weekStart, i))
    }

    const hours = []
    for (let i = 7; i <= 22; i++) {
      hours.push(i)
    }

    return (
      <div className="flex flex-col h-full">
        <div className="grid grid-cols-8 gap-0.5 bg-gray-200 border border-gray-200">
          <div className="p-2 text-xs font-medium text-gray-500 bg-white" />
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => (
            <div key={day} className="p-2 text-xs bg-white">
              <div className="font-medium text-gray-500">{day}</div>
              <div className="text-xs text-gray-700 mt-1">{format(days[index], "d")}</div>
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-8 gap-0.5 border-b border-gray-200">
              <div className="p-2 text-xs text-gray-500 bg-white border-r border-gray-100">
                {format(new Date().setHours(hour, 0), "HH:mm")}
              </div>
              {days.map((day, dayIndex) => {
                const hourTasks = getTasksForDateTime(day, hour)
                const hourEvents = getExternalEventsForDateTime(day, hour)

                return (
                  <DroppableCell
                    key={`${dayIndex}-${hour}`}
                    id={`time-${day.toISOString()}-${hour}`}
                    data={{ type: "time", date: day, hour }}
                    className="h-12 p-1 bg-white border-r border-gray-100"
                  >
                    {hourTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`text-xs p-1 rounded border ${priorityColors[task.priority]}`}
                      >
                        {task.title}
                      </div>
                    ))}
                    {hourEvents.map((event) => (
                      <div
                        key={event.id}
                        className={`text-xs p-1 rounded border ${externalEventColor}`}
                      >
                        {event.title}
                      </div>
                    ))}
                  </DroppableCell>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const DayView = () => {
    const hours = []
    for (let i = 7; i <= 22; i++) {
      hours.push(i)
    }

    return (
      <div className="flex flex-col h-full">
        <div className="grid grid-cols-2 gap-0.5 bg-gray-200 border border-gray-200">
          <div className="p-2 text-xs font-medium text-gray-500 bg-white" />
          <div className="p-2 text-xs bg-white">
            <div className="text-gray-700">{format(currentDate, "EEEE, MMMM d")}</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {hours.map((hour) => {
            const hourTasks = getTasksForDateTime(currentDate, hour)
            const hourEvents = getExternalEventsForDateTime(currentDate, hour)

            return (
              <div key={hour} className="grid grid-cols-2 gap-0.5 border-b border-gray-200">
                <div className="p-2 text-xs text-gray-500 bg-white border-r border-gray-100">
                  {format(new Date().setHours(hour, 0), "HH:mm")}
                </div>
                <DroppableCell
                  id={`time-${currentDate.toISOString()}-${hour}`}
                  data={{ type: "time", date: currentDate, hour }}
                  className="h-14 p-2 bg-white"
                >
                  {hourTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`text-sm p-2 rounded border ${priorityColors[task.priority]}`}
                    >
                      {task.title}
                    </div>
                  ))}
                  {hourEvents.map((event) => (
                    <div
                      key={event.id}
                      className={`text-sm p-2 rounded border ${externalEventColor}`}
                    >
                      {event.title}
                    </div>
                  ))}
                </DroppableCell>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevious}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            ←
          </button>
          <button
            onClick={onToday}
            className="px-3 py-1 text-sm hover:bg-gray-100 rounded transition-colors"
          >
            Today
          </button>
          <button
            onClick={onNext}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            →
          </button>
          <span className="text-sm font-medium text-gray-900 ml-2">
            {format(currentDate, view === "day" ? "EEEE, MMMM d, yyyy" : "MMMM yyyy")}
          </span>
        </div>
        <div className="flex gap-1">
          {(["month", "week", "day"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                view === v
                  ? "bg-gray-900 text-white"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {view === "month" && <MonthView />}
        {view === "week" && <WeekView />}
        {view === "day" && <DayView />}
      </div>
    </div>
  )
}
