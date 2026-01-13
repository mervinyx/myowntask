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

    const calDavUrl = account.serverUrl.endsWith("/")
      ? account.serverUrl
      : account.serverUrl + "/"

    const authHeader = `Basic ${Buffer.from(
      `${account.username}:${account.password}`
    ).toString("base64")}`

    const propfindBody = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:getcontenttype/>
    <D:getetag/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>`

    console.log("Sending PROPFIND to:", calDavUrl)
    const propfindResponse = await fetch(calDavUrl, {
      method: "PROPFIND",
      headers: {
        Authorization: authHeader,
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: propfindBody,
    })

    console.log("PROPFIND response status:", propfindResponse.status)
    const propfindText = await propfindResponse.text()
    console.log(
      "PROPFIND response body (first 2000 chars):",
      propfindText.substring(0, 2000)
    )

    if (!propfindResponse.ok) {
      console.error("PROPFIND failed with status:", propfindResponse.status)
      return NextResponse.json(
        { error: "Failed to list calendar events" },
        { status: 500 }
      )
    }

    const hrefMatches = propfindText.match(/<[^:]*:?href[^>]*>([^<]+)<\/[^:]*:?href>/gi) || []
    const icsUrls: string[] = []

    for (const match of hrefMatches) {
      const href = match.replace(/<[^>]+>/g, "").trim()
      if (href.endsWith(".ics")) {
        if (href.startsWith("http://") || href.startsWith("https://")) {
          icsUrls.push(href)
        } else {
          const baseUrl = new URL(calDavUrl)
          const absoluteUrl = new URL(href, baseUrl.origin).toString()
          icsUrls.push(absoluteUrl)
        }
      }
    }

    console.log("Found .ics files:", icsUrls.length)

    for (const icsUrl of icsUrls) {
      try {
        console.log("Fetching .ics:", icsUrl)
        const icsResponse = await fetch(icsUrl, {
          method: "GET",
          headers: {
            Authorization: authHeader,
          },
        })

        console.log("GET .ics status:", icsResponse.status)

        if (!icsResponse.ok) {
          console.warn("Failed to fetch .ics:", icsUrl, icsResponse.status)
          continue
        }

        const icsContent = await icsResponse.text()
        const events = parseICSContent(icsContent, now)

        for (const event of events) {
          const existingEvent = await prisma.externalEvent.findFirst({
            where: {
              accountId: account.id,
              externalId: event.externalId,
            },
          })

          if (existingEvent) {
            await prisma.externalEvent.update({
              where: { id: existingEvent.id },
              data: {
                title: event.title,
                startAt: event.startAt,
                endAt: event.endAt,
                isAllDay: event.isAllDay,
              },
            })
          } else {
            await prisma.externalEvent.create({
              data: {
                accountId: account.id,
                externalId: event.externalId,
                title: event.title,
                startAt: event.startAt,
                endAt: event.endAt,
                isAllDay: event.isAllDay,
              },
            })
          }

          syncedEvents.push({
            id: event.externalId,
            title: event.title,
            startAt: event.startAt,
            endAt: event.endAt,
            isAllDay: event.isAllDay,
          })
        }
      } catch (icsError) {
        console.error("Error fetching .ics file:", icsUrl, icsError)
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

function parseICSContent(
  icsContent: string,
  now: Date
): Array<{
  externalId: string
  title: string
  startAt: Date
  endAt: Date
  isAllDay: boolean
}> {
  const events: Array<{
    externalId: string
    title: string
    startAt: Date
    endAt: Date
    isAllDay: boolean
  }> = []

  const veventBlocks = icsContent.split("BEGIN:VEVENT")

  for (let i = 1; i < veventBlocks.length; i++) {
    const block = veventBlocks[i].split("END:VEVENT")[0]
    const lines = block.split(/\r?\n/)

    let title = "Untitled Event"
    let startAt: Date | null = null
    let endAt: Date | null = null
    let isAllDay = false
    let externalId = ""

    for (const line of lines) {
      const trimmedLine = line.trim()

      if (trimmedLine.startsWith("SUMMARY:")) {
        title = trimmedLine.substring(8)
      } else if (trimmedLine.startsWith("DTSTART:")) {
        startAt = parseICSDate(trimmedLine.substring(8), false)
      } else if (trimmedLine.startsWith("DTEND:")) {
        endAt = parseICSDate(trimmedLine.substring(6), false)
      } else if (trimmedLine.startsWith("DTSTART;VALUE=DATE:")) {
        isAllDay = true
        startAt = parseICSDate(trimmedLine.substring(19), true)
      } else if (trimmedLine.startsWith("DTEND;VALUE=DATE:")) {
        endAt = parseICSDate(trimmedLine.substring(17), true)
      } else if (trimmedLine.startsWith("DTSTART;TZID=")) {
        const valueStart = trimmedLine.indexOf(":")
        if (valueStart !== -1) {
          startAt = parseICSDate(trimmedLine.substring(valueStart + 1), false)
        }
      } else if (trimmedLine.startsWith("DTEND;TZID=")) {
        const valueStart = trimmedLine.indexOf(":")
        if (valueStart !== -1) {
          endAt = parseICSDate(trimmedLine.substring(valueStart + 1), false)
        }
      } else if (trimmedLine.startsWith("UID:")) {
        externalId = trimmedLine.substring(4)
      }
    }

    if (startAt && endAt && externalId) {
      if (endAt >= now) {
        events.push({
          externalId,
          title,
          startAt,
          endAt,
          isAllDay,
        })
      }
    }
  }

  return events
}

function parseICSDate(dateString: string, isAllDay: boolean): Date {
  const cleanDate = dateString.replace("Z", "").trim()

  if (isAllDay) {
    const year = parseInt(cleanDate.substring(0, 4))
    const month = parseInt(cleanDate.substring(4, 6)) - 1
    const day = parseInt(cleanDate.substring(6, 8))
    return new Date(year, month, day)
  }

  const year = parseInt(cleanDate.substring(0, 4))
  const month = parseInt(cleanDate.substring(4, 6)) - 1
  const day = parseInt(cleanDate.substring(6, 8))

  if (cleanDate.length >= 15 && cleanDate.charAt(8) === "T") {
    const hour = parseInt(cleanDate.substring(9, 11)) || 0
    const minute = parseInt(cleanDate.substring(11, 13)) || 0
    const second = parseInt(cleanDate.substring(13, 15)) || 0

    if (dateString.endsWith("Z")) {
      return new Date(Date.UTC(year, month, day, hour, minute, second))
    }
    return new Date(year, month, day, hour, minute, second)
  }

  return new Date(year, month, day)
}
