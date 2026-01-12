import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  dueDate: z.string().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
  duration: z.number().optional(),
  completed: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const parsedData = updateTaskSchema.safeParse(body)

    if (!parsedData.success) {
      return NextResponse.json(
        { error: "Invalid data" },
        { status: 400 }
      )
    }

    // Check if task belongs to user
    const existingTask = await prisma.task.findUnique({
      where: { id },
    })

    if (!existingTask || existingTask.userId !== session.user.id) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...parsedData.data,
        dueDate: parsedData.data.dueDate !== undefined
          ? parsedData.data.dueDate ? new Date(parsedData.data.dueDate) : null
          : undefined,
        scheduledAt: parsedData.data.scheduledAt !== undefined
          ? parsedData.data.scheduledAt ? new Date(parsedData.data.scheduledAt) : null
          : undefined,
      },
    })

    return NextResponse.json(task)
  } catch (error) {
    console.error("Update task error:", error)
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params

    // Check if task belongs to user
    const existingTask = await prisma.task.findUnique({
      where: { id },
    })

    if (!existingTask || existingTask.userId !== session.user.id) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    await prisma.task.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete task error:", error)
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    )
  }
}
