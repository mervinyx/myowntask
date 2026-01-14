import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const account = await prisma.calendarAccount.findUnique({
      where: { userId: session.user.id },
    })

    if (!account) {
      return NextResponse.json([])
    }

    const events = await prisma.externalEvent.findMany({
      where: { accountId: account.id },
      orderBy: { startAt: "asc" },
    })

    return NextResponse.json(
      events.map((event) => ({
        id: event.id,
        title: event.title,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt.toISOString(),
        isAllDay: event.isAllDay,
      }))
    )
  } catch (error) {
    console.error("Failed to fetch external events:", error)
    return NextResponse.json(
      { error: "Failed to fetch external events" },
      { status: 500 }
    )
  }
}
