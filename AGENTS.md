# AGENTS.md - Coding Agent Guidelines

This document provides guidelines for AI coding agents working on the TaskFlow project.

## Project Overview

TaskFlow is a task management application with calendar integration built with:
- **Next.js 16** (App Router)
- **React 19**
- **TypeScript** (strict mode)
- **Prisma** (PostgreSQL)
- **NextAuth.js v5** (beta)
- **Tailwind CSS 4**
- **@dnd-kit** (drag-and-drop)
- **Zod** (validation)

## Build / Development Commands

```bash
# Development server (http://localhost:3000)
npm run dev

# Production build (runs prisma generate + db push + next build)
npm run build

# Start production server
npm start

# Linting
npm run lint
```

## Database Commands

```bash
# Generate Prisma client
npx prisma generate

# Push schema changes to database
npx prisma db push

# Open Prisma Studio (database GUI)
npx prisma studio

# Create a migration
npx prisma migrate dev --name <migration-name>
```

## Testing

No testing framework is currently configured. When adding tests:
- Use **Vitest** for unit tests
- Use **Playwright** for E2E tests
- Run single test: `npx vitest run <test-file>` (when configured)

## Project Structure

```
/app                    # Next.js App Router pages and API routes
  /(auth)               # Authentication pages (login, register)
  /(main)               # Main application pages
  /api                  # API route handlers
/components             # Reusable React components
  /ComponentName        # Component folder pattern (index.tsx)
/lib                    # Utility functions and shared logic
  /auth.ts              # NextAuth configuration
  /prisma.ts            # Prisma client singleton
/prisma                 # Database schema and migrations
  /schema.prisma        # Prisma schema definition
/public                 # Static assets
```

## Code Style Guidelines

### Import Organization

Order imports in this sequence:
1. React/Next.js core imports
2. External library imports
3. Local imports using `@/` alias
4. Type imports (use `import type`)

```typescript
// 1. React/Next core
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { NextResponse } from "next/server"

// 2. External libraries
import { Settings } from "lucide-react"
import { z } from "zod"
import { format, addDays } from "date-fns"

// 3. Local imports
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import TaskList from "@/components/TaskList"

// 4. Type imports
import type { Session } from "next-auth"
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Components | PascalCase | `TaskList`, `CalendarSettingsModal` |
| Component files | `index.tsx` in folder or `PascalCase.tsx` | `components/TaskList/index.tsx` |
| API route handlers | Uppercase HTTP methods | `GET`, `POST`, `PATCH`, `DELETE` |
| Interfaces/Types | PascalCase | `Task`, `CalendarProps` |
| Validation schemas | camelCase + Schema suffix | `createTaskSchema`, `updateTaskSchema` |
| Functions/variables | camelCase | `handleCreateTask`, `fetchTasks` |
| Constants | camelCase or UPPER_SNAKE_CASE | `priorityColors`, `API_URL` |

### TypeScript Patterns

- **Strict mode** is enabled - avoid `any` types
- Define interfaces for component props
- Use Zod schemas for API request validation
- Prefer `interface` for object shapes, `type` for unions/primitives

```typescript
// Component props interface
interface TaskListProps {
  tasks: Task[]
  onToggleComplete: (id: string) => void
  onDelete: (id: string) => void
}

// Zod validation schema
const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
})
```

### Error Handling

**API Routes**: Use try-catch with consistent error response format:

```typescript
export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = createTaskSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }

    // ... business logic

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("Operation error:", error)
    return NextResponse.json({ error: "Failed to process" }, { status: 500 })
  }
}
```

**Client-side**: Use try-catch and log errors:

```typescript
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
```

### React Component Patterns

- Use `"use client"` directive for components with state/interactivity
- Prefer functional components with hooks
- Define interfaces for props above the component
- Export component as default

```typescript
"use client"

import { useState } from "react"

interface ComponentProps {
  title: string
  onAction: () => void
}

export default function Component({ title, onAction }: ComponentProps) {
  const [state, setState] = useState(false)

  return (
    <div className="p-4">
      <h1>{title}</h1>
    </div>
  )
}
```

### Styling

- Use **Tailwind CSS** classes exclusively
- No inline styles except for dynamic values
- Group related classes logically

```tsx
<div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
  <button className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800 transition-colors">
    Action
  </button>
</div>
```

### Prisma Patterns

- Use the singleton Prisma client from `@/lib/prisma`
- Always check resource ownership before mutations
- Use transactions for multi-step operations

```typescript
import { prisma } from "@/lib/prisma"

// Check ownership before update/delete
const existingTask = await prisma.task.findUnique({ where: { id } })
if (!existingTask || existingTask.userId !== session.user.id) {
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}
```

### Authentication

- Use `auth()` from `@/lib/auth` in API routes
- Use `useSession()` hook in client components
- Always verify `session?.user?.id` before database operations

## Environment Variables

Required in `.env`:
```
DATABASE_URL=postgresql://...
AUTH_SECRET=...
```

## Common Pitfalls

1. **Missing `"use client"`**: Add directive when using hooks or browser APIs
2. **Prisma client in edge**: Use `@/lib/prisma` singleton to avoid connection issues
3. **Auth checks**: Always verify session before database operations
4. **Type safety**: Avoid `any` - use proper types or Zod inference
5. **Dynamic route params**: In Next.js 16, params is a Promise - use `await params`

```typescript
// Next.js 16 dynamic route params
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // ...
}
```
