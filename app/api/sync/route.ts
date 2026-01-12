import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST() {
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
        { error: "No calendar account configured" },
        { status: 400 }
      )
    }

    const now = new Date()
    const syncedEvents: Array<{
      id: string
      title: string
      startAt: Date
      endAt: Date
      isAllDay: boolean
    }> = []

    const calDavUrl = `${account.serverUrl}/caldav/v2/${account.username}/events/`

    const authHeader = `Basic ${Buffer.from(
      `${account.username}:${account.password}`
    ).toString("base64")}`

    const calDavResponse = await fetch(calDavUrl, {
      method: "REPORT",
      headers: {
        Authorization: authHeader,
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VEVENT">
      <C:time-range start="${now.toISOString().split('.')[0]}Z"/>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`,
    })

    if (calDavResponse.ok) {
      const xmlText = await calDavResponse.text()
      const calendarDataMatches = xmlText.match(/<C:calendar-data[^>]*>([\s\S]*?)<\/C:calendar-data>/gi) || []

      for (const match of calendarDataMatches) {
        const veventData = match.replace(/<[^>]+>/g, "")
        const icalLines = veventData.split("\n")

        let title = "Untitled Event"
        let startAt: Date | null = null
        let endAt: Date | null = null
        let isAllDay = false
        let externalId = ""

        for (let i = 0; i < icalLines.length; i++) {
          const line = icalLines[i].trim()
          if (line.startsWith("SUMMARY:")) {
            title = line.substring(8)
          } else if (line.startsWith("DTSTART:")) {
            startAt = parseICSDate(line.substring(8), false)
          } else if (line.startsWith("DTEND:")) {
            endAt = parseICSDate(line.substring(6), false)
          } else if (line.startsWith("DTSTART;VALUE=DATE:")) {
            isAllDay = true
            startAt = parseICSDate(line.substring(19), true)
          } else if (line.startsWith("DTEND;VALUE=DATE:")) {
            endAt = parseICSDate(line.substring(17), true)
          } else if (line.startsWith("UID:")) {
            externalId = line.substring(4)
          }
        }

        if (startAt && endAt && externalId) {
          const existingEvent = await prisma.externalEvent.findFirst({
            where: {
              accountId: account.id,
              externalId,
            },
          })

          if (existingEvent) {
            await prisma.externalEvent.update({
              where: { id: existingEvent.id },
              data: { title, startAt, endAt, isAllDay },
            })
          } else {
            await prisma.externalEvent.create({
              data: {
                accountId: account.id,
                externalId,
                title,
                startAt,
                endAt,
                isAllDay,
              },
            })
          }

          syncedEvents.push({
            id: externalId,
            title,
            startAt,
            endAt,
            isAllDay,
          })
        }
      }
    }

    await prisma.calendarAccount.update({
      where: { id: account.id },
      data: { lastSynced: now },
    })

    return NextResponse.json({
      success: true,
      syncedEvents: syncedEvents.length,
      lastSyncedAt: now,
    })
  } catch (error) {
    console.error("Sync error:", error)
    return NextResponse.json(
      { error: "Failed to sync calendar" },
      { status: 500 }
    )
  }
}

function parseICSDate(dateString: string, isAllDay: boolean): Date {
  if (isAllDay) {
    const year = parseInt(dateString.substring(0, 4))
    const month = parseInt(dateString.substring(4, 6)) - 1
    const day = parseInt(dateString.substring(6, 8))
    return new Date(year, month, day)
  }

  const year = parseInt(dateString.substring(0, 4))
  const month = parseInt(dateString.substring(4, 6)) - 1
  const day = parseInt(dateString.substring(6, 8))
  const hour = parseInt(dateString.substring(9, 11)) || 0
  const minute = parseInt(dateString.substring(11, 13)) || 0
  const second = parseInt(dateString.substring(13, 15)) || 0

  return new Date(year, month, day, hour, minute, second)
}
