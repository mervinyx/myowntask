import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

function formatCalDavTimestamp(date: Date): string {
  const iso = date.toISOString().replace(/[-:]/g, "")
  return `${iso.slice(0, 15)}Z`
}

function buildCalDavQuery(start: Date, end: Date): string {
  const startUtc = formatCalDavTimestamp(start)
  const endUtc = formatCalDavTimestamp(end)
  return `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data>
      <c:expand start="${startUtc}" end="${endUtc}"/>
    </c:calendar-data>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${startUtc}" end="${endUtc}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`
}

function generateCandidateUrls(originalUrl: string, username: string): string[] {
  const urls = new Set<string>()
  let cleanUrl = originalUrl.trim()
  urls.add(cleanUrl)
  if (cleanUrl.endsWith("/")) {
    cleanUrl = cleanUrl.slice(0, -1)
  } else {
    urls.add(cleanUrl + "/")
  }
  urls.add(`${cleanUrl}/dav/${username}/`)
  urls.add(`${cleanUrl}/caldav/${username}/`)
  urls.add(`${cleanUrl}/dav/`)
  urls.add(`${cleanUrl}/caldav/`)
  return Array.from(urls)
}

function parseICalDate(
  value: string,
  params: Record<string, string> = {}
): { date: Date | null; isAllDay: boolean } {
  const normalizedParams = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k.toUpperCase(), v])
  )
  const isDateOnly =
    normalizedParams.VALUE === "DATE" || /^\d{8}$/.test(value)
  let date: Date | null = null

  if (/^\d{8}T\d{6}Z$/i.test(value)) {
    const formatted = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`
    date = new Date(formatted)
  } else if (/^\d{8}T\d{6}$/i.test(value)) {
    const formatted = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`
    date = new Date(formatted)
  } else if (/^\d{8}$/i.test(value)) {
    const formatted = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00`
    date = new Date(formatted)
  } else {
    date = new Date(value)
  }

  if (Number.isNaN(date?.getTime())) {
    return { date: null, isAllDay: isDateOnly }
  }

  return { date, isAllDay: isDateOnly }
}

function addDuration(startDate: Date, durationStr: string): Date {
  const match = durationStr.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
  )
  if (!match) {
    return new Date(startDate.getTime())
  }
  const days = Number(match[1] || 0)
  const hours = Number(match[2] || 0)
  const minutes = Number(match[3] || 0)
  const seconds = Number(match[4] || 0)
  const totalMs =
    ((days * 24 + hours) * 60 * 60 + minutes * 60 + seconds) * 1000
  return new Date(startDate.getTime() + totalMs)
}

interface ParsedEvent {
  id: string
  summary: string
  start: Date
  end: Date
  isAllDay: boolean
}

function parseSingleVEvent(text: string): ParsedEvent | null {
  if (!text) {
    return null
  }
  const lines = text.split(/\r?\n/)
  const data: {
    summary: string
    start: Date | null
    end: Date | null
    isAllDay: boolean
    uid: string
  } = {
    summary: "",
    start: null,
    end: null,
    isAllDay: false,
    uid: "",
  }

  lines.forEach((rawLine) => {
    if (!rawLine) {
      return
    }
    const colonIdx = rawLine.indexOf(":")
    if (colonIdx === -1) {
      return
    }
    const rawKey = rawLine.slice(0, colonIdx)
    const rawValue = rawLine.slice(colonIdx + 1)
    const [name, ...paramParts] = rawKey.split(";")
    const params = paramParts.reduce(
      (acc, part) => {
        const eqIdx = part.indexOf("=")
        if (eqIdx !== -1) {
          const k = part.slice(0, eqIdx)
          const v = part.slice(eqIdx + 1)
          if (k && v) {
            acc[k.toUpperCase()] = v
          }
        }
        return acc
      },
      {} as Record<string, string>
    )
    const key = name.toUpperCase()
    if (key === "SUMMARY") {
      data.summary = rawValue.trim()
    } else if (key === "UID") {
      data.uid = rawValue.trim()
    } else if (key === "DTSTART") {
      const parsed = parseICalDate(rawValue.trim(), params)
      data.start = parsed.date
      if (parsed.isAllDay) {
        data.isAllDay = true
      }
    } else if (key === "DTEND") {
      const parsed = parseICalDate(rawValue.trim(), params)
      data.end = parsed.date
      if (parsed.isAllDay) {
        data.isAllDay = true
      }
    } else if (key === "DURATION" && data.start && !data.end) {
      data.end = addDuration(data.start, rawValue.trim())
    }
  })

  if (!data.start) {
    return null
  }
  if (!data.end) {
    data.end = data.isAllDay
      ? new Date(data.start.getTime() + 24 * 60 * 60 * 1000)
      : new Date(data.start.getTime() + 60 * 60 * 1000)
  }

  return {
    id: data.uid || `event-${data.start.getTime()}`,
    summary: data.summary || "Untitled Event",
    start: data.start,
    end: data.end,
    isAllDay: data.isAllDay,
  }
}

function parseICSEvents(icsText: string): ParsedEvent[] {
  if (!icsText) {
    return []
  }
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "")
  return unfolded
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((chunk) => {
      const body = chunk.split("END:VEVENT")[0]
      return parseSingleVEvent(body)
    })
    .filter((e): e is ParsedEvent => e !== null)
}

function parseCalDavResponse(
  xmlText: string,
  rangeStart: Date,
  rangeEnd: Date
): ParsedEvent[] {
  if (!xmlText) {
    return []
  }

  const calendarDataMatches: string[] = []
  const regex = /<[^>]*calendar-data[^>]*>([\s\S]*?)<\/[^>]*calendar-data>/gi
  let match
  while ((match = regex.exec(xmlText)) !== null) {
    calendarDataMatches.push(match[1])
  }

  console.log("Found calendar-data nodes:", calendarDataMatches.length)

  const events: ParsedEvent[] = []
  calendarDataMatches.forEach((content) => {
    events.push(...parseICSEvents(content))
  })

  const filtered: ParsedEvent[] = []
  const seen = new Set<string>()
  events.forEach((event) => {
    if (!event.start || !event.end) {
      return
    }
    if (event.end <= rangeStart || event.start >= rangeEnd) {
      return
    }
    const key = `${event.id}-${event.start.getTime()}`
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    filtered.push(event)
  })
  return filtered.sort((a, b) => a.start.getTime() - b.start.getTime())
}

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
    const rangeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const rangeEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const authHeader = `Basic ${Buffer.from(
      `${account.username}:${account.password}`
    ).toString("base64")}`

    const body = buildCalDavQuery(rangeStart, rangeEnd)
    const candidateUrls = generateCandidateUrls(
      account.serverUrl,
      account.username
    )

    console.log("Trying candidate URLs:", candidateUrls)

    let response: Response | null = null
    let successUrl: string | null = null

    for (const url of candidateUrls) {
      try {
        console.log("Trying REPORT:", url)
        const res = await fetch(url, {
          method: "REPORT",
          headers: {
            Depth: "1",
            "Content-Type": "application/xml; charset=utf-8",
            Authorization: authHeader,
          },
          body,
        })

        console.log("REPORT response status:", res.status)

        if (res.ok) {
          response = res
          successUrl = url
          console.log("Success with URL:", url)
          break
        } else if (res.status === 401 || res.status === 403) {
          return NextResponse.json(
            { error: "CalDAV authentication failed" },
            { status: 401 }
          )
        } else if (res.status === 404 || res.status === 405) {
          continue
        }
      } catch (err) {
        console.log("Fetch error for", url, err)
        continue
      }
    }

    if (!response) {
      return NextResponse.json(
        { error: "Could not connect to CalDAV server (check URL)" },
        { status: 500 }
      )
    }

    const xmlText = await response.text()
    console.log("CalDAV XML Response Length:", xmlText.length)
    console.log("CalDAV XML Response (first 1000):", xmlText.substring(0, 1000))

    const events = parseCalDavResponse(xmlText, rangeStart, rangeEnd)
    console.log("Parsed events:", events.length)

    const syncedEvents: Array<{
      id: string
      title: string
      startAt: Date
      endAt: Date
      isAllDay: boolean
    }> = []

    for (const event of events) {
      const existingEvent = await prisma.externalEvent.findFirst({
        where: {
          accountId: account.id,
          externalId: event.id,
        },
      })

      if (existingEvent) {
        await prisma.externalEvent.update({
          where: { id: existingEvent.id },
          data: {
            title: event.summary,
            startAt: event.start,
            endAt: event.end,
            isAllDay: event.isAllDay,
          },
        })
      } else {
        await prisma.externalEvent.create({
          data: {
            accountId: account.id,
            externalId: event.id,
            title: event.summary,
            startAt: event.start,
            endAt: event.end,
            isAllDay: event.isAllDay,
          },
        })
      }

      syncedEvents.push({
        id: event.id,
        title: event.summary,
        startAt: event.start,
        endAt: event.end,
        isAllDay: event.isAllDay,
      })
    }

    if (successUrl && successUrl !== account.serverUrl) {
      await prisma.calendarAccount.update({
        where: { id: account.id },
        data: { serverUrl: successUrl },
      })
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
