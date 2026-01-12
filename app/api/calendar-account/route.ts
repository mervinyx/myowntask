import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createAccountSchema = z.object({
  name: z.string().min(1),
  serverUrl: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1),
  color: z.string().optional(),
})

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const account = await prisma.calendarAccount.findUnique({
    where: { userId: session.user.id },
  })

  if (!account) {
    return NextResponse.json(null)
  }

  return NextResponse.json({
    id: account.id,
    name: account.name,
    serverUrl: account.serverUrl,
    username: account.username,
    color: account.color,
    lastSynced: account.lastSynced,
    createdAt: account.createdAt,
  })
}

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsedData = createAccountSchema.safeParse(body)

    if (!parsedData.success) {
      return NextResponse.json(
        { error: "Invalid data" },
        { status: 400 }
      )
    }

    const account = await prisma.calendarAccount.create({
      data: {
        userId: session.user.id,
        name: parsedData.data.name,
        serverUrl: parsedData.data.serverUrl,
        username: parsedData.data.username,
        password: parsedData.data.password,
        color: parsedData.data.color || "#A0A0A0",
      },
    })

    return NextResponse.json(
      {
        id: account.id,
        name: account.name,
        serverUrl: account.serverUrl,
        username: account.username,
        color: account.color,
        lastSynced: account.lastSynced,
        createdAt: account.createdAt,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Create calendar account error:", error)
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Calendar account already exists" },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: "Failed to create calendar account" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const account = await prisma.calendarAccount.findUnique({
      where: { userId: session.user.id },
    })

    if (!account) {
      return NextResponse.json(
        { error: "Calendar account not found" },
        { status: 404 }
      )
    }

    await prisma.calendarAccount.delete({
      where: { userId: session.user.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete calendar account error:", error)
    return NextResponse.json(
      { error: "Failed to delete calendar account" },
      { status: 500 }
    )
  }
}
