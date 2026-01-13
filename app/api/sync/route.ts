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

function getBaseUrl(originalUrl: string): string {
  let cleanUrl = originalUrl.trim()
  if (cleanUrl.endsWith("/")) {
    cleanUrl = cleanUrl.slice(0, -1)
  }
  try {
    const url = new URL(cleanUrl)
    return `${url.protocol}//${url.host}`
  } catch {
    return cleanUrl
  }
}

function generateCalendarHomeUrls(originalUrl: string, username: string): string[] {
  const urls = new Set<string>()
  let cleanUrl = originalUrl.trim()
  if (cleanUrl.endsWith("/")) {
    cleanUrl = cleanUrl.slice(0, -1)
  }
  
  const baseUrl = getBaseUrl(cleanUrl)
  
  urls.add(cleanUrl + "/")
  urls.add(`${baseUrl}/dav/${username}/`)
  urls.add(`${baseUrl}/caldav/${username}/`)
  urls.add(`${baseUrl}/calendars/${username}/`)
  urls.add(`${baseUrl}/principals/users/${username}/`)
  
  return Array.from(urls)
}

interface DiscoveredCalendar {
  href: string
  displayName: string
  isCalendar: boolean
}

async function discoverCalendars(
  homeUrl: string,
  authHeader: string
): Promise<DiscoveredCalendar[]> {
  const propfindBody = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
  </d:prop>
</d:propfind>`

  try {
    const res = await fetch(homeUrl, {
      method: "PROPFIND",
      headers: {
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
        Authorization: authHeader,
      },
      body: propfindBody,
    })

    if (!res.ok) {
      console.log("PROPFIND failed for", homeUrl, "status:", res.status)
      return []
    }

    const xmlText = await res.text()
    console.log("PROPFIND response length:", xmlText.length)

    const calendars: DiscoveredCalendar[] = []
    const responseRegex = /<D:response[^>]*>([\s\S]*?)<\/D:response>/gi
    let match
    
    while ((match = responseRegex.exec(xmlText)) !== null) {
      const responseBlock = match[1]
      
      const hrefMatch = /<D:href[^>]*>([^<]+)<\/D:href>/i.exec(responseBlock)
      if (!hrefMatch) continue
      const href = hrefMatch[1]
      
      const isCalendar = /<[Cc]:calendar[^>]*\/?>/i.test(responseBlock)
      
      const displayNameMatch = /<D:displayname[^>]*>([^<]*)<\/D:displayname>/i.exec(responseBlock)
      const displayName = displayNameMatch ? displayNameMatch[1] : href
      
      if (isCalendar) {
        calendars.push({ href, displayName, isCalendar })
      }
    }
    
    console.log("Discovered calendars:", calendars)
    return calendars
  } catch (err) {
    console.error("Error discovering calendars:", err)
    return []
  }
}

function resolveCalendarUrl(baseUrl: string, href: string): string {
  if (href.startsWith("/")) {
    try {
      const url = new URL(baseUrl)
      return `${url.protocol}//${url.host}${href}`
    } catch {
      return baseUrl + href
    }
  }
  return baseUrl.endsWith("/") ? baseUrl + href : baseUrl + "/" + href
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

async function queryCalendarEvents(
  calendarUrl: string,
  authHeader: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<{ events: ParsedEvent[]; success: boolean }> {
  const body = buildCalDavQuery(rangeStart, rangeEnd)
  
  try {
    console.log("Querying calendar:", calendarUrl)
    const res = await fetch(calendarUrl, {
      method: "REPORT",
      headers: {
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
        Authorization: authHeader,
      },
      body,
    })

    if (!res.ok) {
      console.log("REPORT failed for", calendarUrl, "status:", res.status)
      return { events: [], success: false }
    }

    const xmlText = await res.text()
    console.log("REPORT response length:", xmlText.length)
    
    const events = parseCalDavResponse(xmlText, rangeStart, rangeEnd)
    console.log("Parsed events from", calendarUrl, ":", events.length)
    
    return { events, success: true }
  } catch (err) {
    console.error("Error querying calendar:", err)
    return { events: [], success: false }
  }
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

    const calendarHomeUrls = generateCalendarHomeUrls(
      account.serverUrl,
      account.username
    )

    console.log("Trying calendar home URLs:", calendarHomeUrls)

    let allEvents: ParsedEvent[] = []
    let successUrl: string | null = null
    let discoveredAnyCalendar = false

    for (const homeUrl of calendarHomeUrls) {
      const calendars = await discoverCalendars(homeUrl, authHeader)
      
      if (calendars.length === 0) {
        continue
      }
      
      discoveredAnyCalendar = true
      console.log(`Found ${calendars.length} calendars at ${homeUrl}`)

      for (const calendar of calendars) {
        const calendarUrl = resolveCalendarUrl(homeUrl, calendar.href)
        const { events, success } = await queryCalendarEvents(
          calendarUrl,
          authHeader,
          rangeStart,
          rangeEnd
        )
        
        if (success) {
          allEvents.push(...events)
          if (!successUrl) {
            successUrl = homeUrl
          }
        }
      }
      
      if (allEvents.length > 0) {
        break
      }
    }

    if (!discoveredAnyCalendar) {
      return NextResponse.json(
        { error: "Could not find any calendars. Check server URL and credentials." },
        { status: 500 }
      )
    }

    const seen = new Set<string>()
    const events = allEvents.filter((event) => {
      const key = `${event.id}-${event.start.getTime()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).sort((a, b) => a.start.getTime() - b.start.getTime())
    
    console.log("Total unique events:", events.length)

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
