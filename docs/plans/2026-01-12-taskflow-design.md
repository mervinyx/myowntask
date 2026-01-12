# TaskFlow 设计文档

## 产品概述

**TaskFlow** — 将待办与日历融合的日程管理工具。左侧管理任务池，右侧可视化时间安排，通过拖拽完成任务到时间的分配。

## 核心功能

### 1. 待办管理
- 创建任务：标题、描述、优先级（高/中/低）、截止日期
- 分组展示：「未安排」vs「已安排」
- 编辑、删除、标记完成

### 2. 日历视图
- 三种视图切换：月视图 / 周视图 / 日视图
- 显示 TaskFlow 任务（带时间、优先级颜色）
- 显示外部 CalDAV 事件（只读，特殊颜色标识）

### 3. 拖拽交互
- **拖到月视图** → 分配到那一天（全天任务）
- **拖到周/日视图的时间格** → 分配具体时间段（默认 1 小时）
- **从日历拖回待办** → 清除时间安排，回到「未安排」组

### 4. CalDAV 同步
- 连接单个 CalDAV 账号
- 同步外部日历事件到本地缓存
- 外部事件只读展示，用特殊颜色区分

### 5. 用户系统
- 邮箱密码注册/登录
- 数据隔离（每个用户只能访问自己的数据）

## 数据模型

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  password  String
  createdAt DateTime @default(now())

  tasks             Task[]
  calendarAccount   CalendarAccount?
}

model Task {
  id          String    @id @default(uuid())
  userId      String
  title       String
  description String?
  priority    Priority  @default(MEDIUM)
  dueDate     DateTime?
  scheduledAt DateTime?
  duration    Int?      @default(60)  // 分钟
  completed   Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model CalendarAccount {
  id         String   @id @default(uuid())
  userId     String   @unique  // MVP 单账号
  name       String
  serverUrl  String
  username   String
  password   String
  color      String   @default("#A0A0A0")
  lastSynced DateTime?
  createdAt  DateTime @default(now())

  user            User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  externalEvents  ExternalEvent[]
}

model ExternalEvent {
  id         String   @id @default(uuid())
  accountId  String
  externalId String
  title      String
  startAt    DateTime
  endAt      DateTime
  isAllDay   Boolean  @default(false)

  account CalendarAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
}

enum Priority {
  HIGH
  MEDIUM
  LOW
}
```

## 组件设计

### 1. 主页面布局 (`app/(main)/page.tsx`)

```tsx
// 布局结构
<div className="flex h-screen bg-white">
  <aside className="w-80 border-r border-gray-200 flex flex-col">
    <TaskList />
  </aside>
  <main className="flex-1 flex flex-col">
    <ViewSwitcher /> {/* 月/周/日切换 */}
    <Calendar />
  </main>
</div>
```

### 2. TaskList 组件

```tsx
// src/components/TaskList/index.tsx
interface TaskListProps {
  tasks: Task[];
  onUpdateTask: (id: string, data: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
}

// 分组展示
<div>
  <Section title="未安排" tasks={unscheduledTasks} />
  <Section title="已安排" tasks={scheduledTasks} />
</div>
```

**TaskItem 可拖拽**：
```tsx
<Draggable id={task.id} data={{ type: 'task', task }}>
  <div className={priorityStyles}>
    {task.title}
  </div>
</Draggable>
```

### 3. Calendar 组件

```tsx
// src/components/Calendar/index.tsx
interface CalendarProps {
  view: 'month' | 'week' | 'day';
  currentDate: Date;
  tasks: Task[];
  externalEvents: ExternalEvent[];
  onDropTask: (taskId: string, date: Date, time?: string) => void;
  onDragBack: (taskId: string) => void;
}
```

**三种视图**：
- `MonthView`：7x6 网格，每天显示任务标题
- `WeekView`：时间轴（7am-11pm），纵向排列任务块
- `DayView`：单日详细视图，类似周视图

**时间格可放置**：
```tsx
<Droppable id={`date-${dateStr}`} data={{ type: 'date', date }}>
  <DayCell date={date} />
</Droppable>

<Droppable id={`time-${dateStr}-${hour}`} data={{ type: 'time', date, hour }}>
  <TimeSlot date={date} hour={hour} />
</Droppable>
```

### 4. 拖拽逻辑（dnd-kit）

```tsx
// src/components/DragDropProvider.tsx
<DndContext onDragEnd={handleDragEnd}>
  <DragOverlay>
    {activeId ? <TaskItemDragPreview /> : null}
  </DragOverlay>
  {children}
</DndContext>

const handleDragEnd = (event) => {
  const { active, over } = event;

  if (!over) return;

  const activeData = active.data.current;
  const overData = over.data.current;

  // 任务拖到日历日期
  if (activeData.type === 'task' && overData.type === 'date') {
    const newScheduledAt = overData.date; // 全天任务
    updateTask(active.id, { scheduledAt: newScheduledAt });
  }

  // 任务拖到时间格
  if (activeData.type === 'task' && overData.type === 'time') {
    const { date, hour } = overData;
    const startAt = new Date(date);
    startAt.setHours(hour, 0, 0, 0);
    updateTask(active.id, { scheduledAt: startAt });
  }

  // 任务从日历拖回待办
  if (activeData.type === 'task' && overData.type === 'unscheduled-zone') {
    updateTask(active.id, { scheduledAt: null });
  }
};
```

## API 设计

### 1. 认证 API (`app/api/auth/[...nextauth]/route.ts`)

**POST /api/auth/signin** - 登录
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**POST /api/auth/signup** - 注册
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

### 2. 任务 API (`app/api/tasks/route.ts`)

**GET /api/tasks** - 获取用户所有任务
```json
[
  {
    "id": "uuid",
    "title": "写周报",
    "description": "总结本周工作",
    "priority": "HIGH",
    "dueDate": "2026-01-15T00:00:00Z",
    "scheduledAt": "2026-01-14T09:00:00Z",
    "duration": 60,
    "completed": false
  }
]
```

**POST /api/tasks** - 创建任务
```json
{
  "title": "新任务",
  "description": "描述",
  "priority": "MEDIUM",
  "duration": 60
}
```

**PATCH /api/tasks/[id]** - 更新任务
```json
{
  "scheduledAt": "2026-01-14T10:00:00Z",
  "completed": true
}
```

**DELETE /api/tasks/[id]** - 删除任务

### 3. CalDAV 账号 API (`app/api/calendar-account/route.ts`)

**POST /api/calendar-account** - 连接 CalDAV
```json
{
  "name": "Google 日历",
  "serverUrl": "https://apidata.googleusercontent.com/caldav/v2/",
  "username": "user@gmail.com",
  "password": "app-password"
}
```

**GET /api/calendar-account** - 获取已连接账号

**DELETE /api/calendar-account** - 断开连接

### 4. 同步 API (`app/api/sync/route.ts`)

**POST /api/sync** - 手动触发同步
```json
{
  "syncExternal": true  // 是否同步外部事件
}
```

**响应**：
```json
{
  "success": true,
  "syncedEvents": 25,
  "lastSyncedAt": "2026-01-14T10:00:00Z"
}
```

## 页面流程

### 未登录流程

```
/ → /login → /register → /(main)  // 注册成功后跳转主页
```

### 已登录流程

```
/(main)
  - 创建任务 → POST /api/tasks → 刷新列表
  - 拖拽任务 → PATCH /api/tasks → 刷新日历
  - 连接 CalDAV → POST /api/calendar-account → POST /api/sync → 刷新日历
  - 切换视图 → 本地状态变更 → 重新渲染
```

## UI 风格

### 配色方案（简约克制）

| 颜色 | 用途 | 值 |
|-----|------|-----|
| Background | 背景 | `#FFFFFF` |
| Text Primary | 主要文字 | `#1A1A1A` |
| Text Secondary | 次要文字 | `#6B7280` |
| Border | 边框 | `#E5E7EB` |
| Priority High | 高优先级 | `#DC2626` (左侧边框) |
| Priority Medium | 中优先级 | `#F59E0B` (左侧边框) |
| Priority Low | 低优先级 | `#3B82F6` (左侧边框) |
| External Event | 外部日历 | `#F3F4F6` 背景 |

### 排版

- 标题：`text-sm font-medium`
- 描述：`text-xs text-gray-500`
- 时间：`text-xs text-gray-400`

### 间距

- 组件间距：`p-4`, `gap-4`
- 小间距：`p-2`, `gap-2`

### 圆角

- 小：`rounded`
- 中：`rounded-md`

## 未来规划

### AI 功能

1. **智能安排** - 根据任务优先级、时长、已有日程，建议最佳时间段
2. **自然语言输入** - 对话方式创建任务，"明天下午3点开会"自动解析
3. **任务拆解** - 输入大任务，AI 拆成可执行的子任务

### 扩展功能

1. **多 CalDAV 账号** - 连接多个日历源
2. **任务标签/分类** - 自定义分组
3. **团队协作** - 共享日历和任务
4. **通知提醒** - 邮件/浏览器通知
5. **移动端适配** - 响应式设计

## 技术栈

| 层级 | 选型 |
|-----|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS |
| 数据库 | PostgreSQL (Zeabur) |
| ORM | Prisma |
| 认证 | NextAuth.js v5 |
| 拖拽 | @dnd-kit/core |
| CalDAV | tsdav |
| 部署 | Zeabur |
