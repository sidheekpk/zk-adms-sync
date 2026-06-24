# Claude Code Prompt: ZK Connect — ZKTeco ADMS Device Bridge & Sync Middleware

## What This Is

**ZK Connect** is a **middleware/bridge service** that sits between remote ZKTeco biometric devices and our actual HR attendance software (like RadixHR, or any other HR system via API/webhook). It is NOT the HR system itself.

**The job is simple:**
1. Receive attendance data + device events from remote ZKTeco machines (via ADMS push protocol)
2. Manage devices remotely (send commands, sync users, reboot, etc.)
3. Forward/sync all attendance data to our actual HR software via configurable webhooks/API calls
4. Provide a lightweight admin panel to monitor devices, view raw logs, and manage sync status

```
┌──────────────┐     ADMS Push      ┌──────────────┐   Webhook/API   ┌──────────────┐
│  ZK Device 1 │ ──────────────────▶│              │ ──────────────▶│              │
│  (Office A)  │                    │              │                │  RadixHR     │
├──────────────┤     ADMS Push      │  ZK Connect  │   Webhook/API   │  or any HR   │
│  ZK Device 2 │ ──────────────────▶│  (This App)  │ ──────────────▶│  Software    │
│  (Office B)  │                    │              │                │              │
├──────────────┤     ADMS Push      │              │   Webhook/API   │              │
│  ZK Device N │ ──────────────────▶│              │ ──────────────▶│              │
│  (Remote)    │                    │              │                │              │
└──────────────┘                    └──────────────┘                └──────────────┘
                                          │
                                    Admin Panel
                                    (Monitor & Manage)
```

---

## Why NOT Next.js — Stack Decision

This is a **protocol-level middleware** that must handle raw HTTP from embedded devices, maintain persistent connections, queue commands, and fire webhooks reliably. Next.js is wrong for this because:

- ZKTeco devices send non-standard HTTP (custom headers, raw text bodies, tab-separated data) — Next.js API routes add unnecessary overhead and abstraction
- We need fine-grained control over HTTP response formatting (exact headers, exact body text)
- No SSR/React needed — admin panel is lightweight monitoring, not a full web app
- We need long-running background tasks (sync workers, device timeout checkers, retry queues)
- We need WebSocket/SSE alongside HTTP on the same server

### Chosen Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Runtime** | Node.js 20+ | Stable, mature, best ecosystem for this use case |
| **HTTP Framework** | **Hono** | Ultra-lightweight (14KB), first-class TypeScript, handles raw HTTP perfectly, fastest middleware pipeline. Perfect for protocol-level server where we control exact responses |
| **Database** | **SQLite** (via better-sqlite3) + **Drizzle ORM** | Zero infrastructure — single file DB is perfect for a bridge service. No PostgreSQL setup needed. Handles thousands of devices easily. Can upgrade to PostgreSQL later with Drizzle's driver swap |
| **Background Jobs** | **BullMQ** + **Redis** (optional) OR simple in-memory queue | For webhook retries and sync jobs. Start with in-memory, add Redis when scaling |
| **Admin UI** | **Hono + JSX** (built-in) OR static HTML served by Hono | Minimal dashboard — no React/Vue needed. Server-rendered pages with HTMX for interactivity |
| **Real-time** | **SSE** (Server-Sent Events) via Hono streaming | Live attendance feed + device status |
| **Validation** | **Zod** | Schema validation for API inputs and webhook payloads |
| **Logging** | **Pino** | Fast structured logging, essential for debugging device protocol issues |
| **Process Manager** | **PM2** or **systemd** | Keep it running in production |
| **Container** | **Docker** | Single container deployment |

### Why This Stack Beats Alternatives

- **Hono over Fastify**: Hono is lighter, TypeScript-native, simpler API for raw HTTP handling. Fastify's JSON schema validation is overkill — ZKTeco sends tab-separated text, not JSON.
- **SQLite over PostgreSQL**: This is a bridge, not a data warehouse. SQLite gives us zero-config deployment, atomic writes, and handles concurrent reads fine. The data ultimately lives in the HR system — we just need a reliable buffer.
- **Drizzle over Prisma**: Drizzle is lighter, faster, works perfectly with SQLite, generates clean SQL. Prisma is heavy for a middleware service.
- **No React/Vue**: The admin panel is a monitoring dashboard. Server-rendered HTML with HTMX or Alpine.js gives us interactivity without a build step or client framework.

---

## How ZKTeco ADMS Push Protocol Works

CRITICAL: The ADMS protocol is **device-initiated**. The ZKTeco device is the HTTP CLIENT and our server is the HTTP SERVER. Devices push data to us.

### Protocol Flow

```
Device boots up → Connects to our server
    │
    ▼
GET /iclock/cdata?SN=xxx&options=all          ← Handshake (device registers)
    Server responds with config params
    │
    ▼
Every {Delay} seconds:
GET /iclock/getrequest?SN=xxx                 ← Heartbeat (device polls for commands)
    Server responds with "OK" or queued commands
    │
    ▼
When attendance happens:
POST /iclock/cdata?SN=xxx&table=ATTLOG        ← Attendance data push
    Body: tab-separated attendance records
    Server responds "OK"
    │
    ▼
POST /iclock/cdata?SN=xxx&table=OPERLOG       ← Operation log push
    Body: user changes, config changes
    Server responds "OK"
    │
    ▼
POST /iclock/devicecmd?SN=xxx                 ← Command result callback
    Body: ID={cmdId}&Return={code}&CMD={type}
    Server responds "OK"
```

### Key Endpoints Our Server Must Implement

All under the `/iclock/` path prefix. These are called BY the devices — no auth possible.

```
GET  /iclock/cdata          → Device handshake & initial registration
POST /iclock/cdata          → Receive attendance logs, user data, operation logs
GET  /iclock/getrequest     → Heartbeat + deliver queued commands back to device
POST /iclock/devicecmd      → Receive command execution results from device
POST /iclock/fdata          → Receive fingerprint/face template data (optional)
```

### 1. Handshake — GET /iclock/cdata

Device sends:
```
GET /iclock/cdata?SN=BOCK200961014&options=all&language=69&pushver=2.4.0&DeviceType=middle%20east&PushOptionsFlag=1
```

Our server MUST respond with EXACTLY this format (plain text, NOT JSON):
```
GET OPTION FROM: BOCK200961014
Stamp=9999
OpStamp=9999
ErrorDelay=60
Delay=30
TransTimes=00:00;14:05
TransInterval=1
TransFlag=1111000000
Realtime=1
Encrypt=0
ServerVersion=3.0.1
ServerName=ZKConnect
PushVersion=3.0.1
TimeoutSec=10
```

Key parameters:
- `Stamp`: Last attendance record timestamp server has (return saved value or 9999 for "send everything")
- `OpStamp`: Last operation log timestamp
- `Delay`: Seconds between heartbeats (30 = device pings every 30s)
- `Realtime`: 1 = push attendance in real-time as it happens
- `ErrorDelay`: Seconds to wait before retry on connection error

**CRITICAL**: On first connection, auto-register the device in our DB using the serial number. Also extract device info from query params (pushver, DeviceType, language).

### 2. Attendance Upload — POST /iclock/cdata

Device sends:
```
POST /iclock/cdata?SN=BOCK200961014&table=ATTLOG&Stamp=1705312200
Content-Type: application/x-www-form-urlencoded

1001\t2024-01-15 09:30:00\t0\t1\t0\t0\t0
1002\t2024-01-15 09:31:00\t1\t15\t0\t0\t0
1003\t2024-01-15 09:32:00\t0\t2\t0\t0\t0
```

Each line is tab-separated (`\t`):
```
{PIN}\t{Timestamp}\t{Status}\t{VerifyMode}\t{WorkCode}\t{Reserved1}\t{Reserved2}
```

Field definitions:
| Field | Values | Meaning |
|-------|--------|---------|
| PIN | String | Employee ID/PIN on device |
| Timestamp | YYYY-MM-DD HH:MM:SS | When the punch happened |
| Status | 0=Check-In, 1=Check-Out, 2=Break-Out, 3=Break-In, 4=OT-In, 5=OT-Out | Punch type |
| VerifyMode | 0=Password, 1=Fingerprint, 2=Card, 4=Palm, 9=Face, 15=Face | How employee verified |
| WorkCode | String | Work code (usually 0) |

**Response**: ALWAYS respond with plain text `OK` immediately. Parse and store asynchronously.

### 3. Heartbeat — GET /iclock/getrequest

Device sends:
```
GET /iclock/getrequest?SN=BOCK200961014
```

If no pending commands, respond with:
```
OK
```

If we have commands queued for this device, respond with:
```
C:1:REBOOT
```

Or multiple commands (newline-separated):
```
C:1:SET OPTIONS DateTime=1705312200
C:2:DATA UPDATE user PIN=1001\tName=Ahmed\tPri=0\tPasswd=\tCard=
C:3:INFO
```

### 4. Sending Commands TO Devices

Commands are queued in our DB and delivered when the device next polls `/iclock/getrequest`.

**Command format**: `C:{commandId}:{commandType} {parameters}`

| Command | Format | Purpose |
|---------|--------|---------|
| Reboot | `C:{id}:REBOOT` | Restart device |
| Sync Time | `C:{id}:SET OPTIONS DateTime={unixSeconds}` | Set device clock |
| Clear Attendance Log | `C:{id}:CLEAR LOG` | Clear all attendance records on device |
| Clear All Data | `C:{id}:CLEAR DATA` | Factory reset data |
| Get Device Info | `C:{id}:INFO` | Request device info |
| Add/Update User | `C:{id}:DATA UPDATE user PIN={pin}\tName={name}\tPri={pri}\tPasswd={pwd}\tCard={card}` | Push user to device |
| Delete User | `C:{id}:DATA DEL_USER PIN={pin}` | Remove user from device |
| Query All Users | `C:{id}:DATA QUERY tablename=user,fielddesc=*,filter=*` | Pull all users from device |
| Get Options | `C:{id}:GET OPTIONS ~SerialNumber,FirmVer,IPAddress,MACAddress,UserCount,AttLogCount` | Get device parameters |

### 5. Command Result — POST /iclock/devicecmd

Device sends back:
```
POST /iclock/devicecmd?SN=BOCK200961014

ID=1&Return=0&CMD=REBOOT
```

`Return=0` = success. Negative values = error.

Always respond `OK`.

---

## Database Schema (Drizzle + SQLite)

```typescript
// src/db/schema.ts
import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================
// DEVICES
// ============================================
export const devices = sqliteTable('devices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  serialNumber: text('serial_number').notNull().unique(),
  name: text('name').default(''),                          // Admin-assigned friendly name
  model: text('model'),
  firmwareVersion: text('firmware_version'),
  ipAddress: text('ip_address'),
  macAddress: text('mac_address'),
  pushVersion: text('push_version'),
  deviceType: text('device_type'),
  platform: text('platform'),
  userCount: integer('user_count'),
  attLogCount: integer('att_log_count'),
  lastOnline: text('last_online'),                         // ISO timestamp
  isOnline: integer('is_online', { mode: 'boolean' }).default(false),
  lastStamp: text('last_stamp').default('0'),              // Last attendance stamp synced
  lastOpStamp: text('last_op_stamp').default('0'),         // Last operation stamp synced
  locationId: integer('location_id').references(() => locations.id),
  heartbeatInterval: integer('heartbeat_interval').default(30),  // Seconds
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ============================================
// LOCATIONS (offices/branches)
// ============================================
export const locations = sqliteTable('locations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  address: text('address'),
  timezone: text('timezone').default('Asia/Dubai'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ============================================
// ATTENDANCE LOGS (raw from devices)
// ============================================
export const attendanceLogs = sqliteTable('attendance_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deviceId: integer('device_id').notNull().references(() => devices.id),
  deviceSN: text('device_sn').notNull(),                   // Denormalized for fast queries
  pin: text('pin').notNull(),                              // Employee PIN from device
  timestamp: text('timestamp').notNull(),                  // ISO timestamp of punch
  status: integer('status').notNull(),                     // 0=In, 1=Out, 2=BreakOut...
  verifyMode: integer('verify_mode').notNull(),            // 0=Pwd, 1=FP, 2=Card, 15=Face
  workCode: text('work_code').default('0'),
  rawData: text('raw_data'),                               // Original line from device
  sourceIp: text('source_ip'),
  // Sync tracking
  syncStatus: text('sync_status').default('pending'),      // pending | synced | failed | skipped
  syncAttempts: integer('sync_attempts').default(0),
  lastSyncError: text('last_sync_error'),
  syncedAt: text('synced_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => ({
  // Prevent duplicate punches
  uniquePunch: uniqueIndex('idx_unique_punch').on(table.deviceSN, table.pin, table.timestamp),
  // Fast queries
  idxTimestamp: index('idx_timestamp').on(table.timestamp),
  idxSyncStatus: index('idx_sync_status').on(table.syncStatus),
  idxDevicePin: index('idx_device_pin').on(table.deviceId, table.pin),
}));

// ============================================
// DEVICE COMMANDS (queue for sending to devices)
// ============================================
export const deviceCommands = sqliteTable('device_commands', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deviceId: integer('device_id').notNull().references(() => devices.id),
  commandId: integer('command_id').notNull(),               // ID sent to device in C:{id}:CMD
  command: text('command').notNull(),                       // Full command string
  commandType: text('command_type').notNull(),              // REBOOT, DATA UPDATE, INFO, etc.
  status: text('status').default('pending'),                // pending | sent | success | failed | expired
  returnCode: integer('return_code'),                       // From device response
  responseData: text('response_data'),                     // Any data returned
  sentAt: text('sent_at'),
  completedAt: text('completed_at'),
  expiresAt: text('expires_at'),                           // Auto-expire stale commands
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ============================================
// DEVICE USERS (users enrolled on devices)
// ============================================
export const deviceUsers = sqliteTable('device_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deviceId: integer('device_id').notNull().references(() => devices.id),
  pin: text('pin').notNull(),                              // PIN on device
  name: text('name'),
  privilege: integer('privilege').default(0),               // 0=User, 14=Admin
  cardNumber: text('card_number'),
  password: text('password'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
}, (table) => ({
  uniqueDevicePin: uniqueIndex('idx_device_user').on(table.deviceId, table.pin),
}));

// ============================================
// SYNC TARGETS (HR systems to sync attendance to)
// ============================================
export const syncTargets = sqliteTable('sync_targets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),                            // "RadixHR", "Custom API", etc.
  type: text('type').notNull().default('webhook'),         // webhook | api
  url: text('url').notNull(),                              // Endpoint URL
  method: text('method').default('POST'),                  // HTTP method
  headers: text('headers').default('{}'),                  // JSON string of custom headers
  authType: text('auth_type').default('none'),             // none | bearer | api_key | basic
  authValue: text('auth_value'),                           // Token, API key, or base64 creds
  payloadTemplate: text('payload_template'),               // Custom JSON template (optional)
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  retryAttempts: integer('retry_attempts').default(3),
  retryDelayMs: integer('retry_delay_ms').default(5000),
  batchSize: integer('batch_size').default(50),            // How many records per sync call
  lastSyncAt: text('last_sync_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ============================================
// SYNC LOG (track every sync attempt)
// ============================================
export const syncLog = sqliteTable('sync_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  syncTargetId: integer('sync_target_id').notNull().references(() => syncTargets.id),
  recordCount: integer('record_count').notNull(),
  status: text('status').notNull(),                        // success | partial | failed
  httpStatus: integer('http_status'),
  responseBody: text('response_body'),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ============================================
// APP SETTINGS
// ============================================
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});
```

---

## Project Structure

```
zk-connect/
├── src/
│   ├── index.ts                          # Entry point — start Hono server
│   ├── server.ts                         # Hono app setup, middleware, routes
│   │
│   ├── adms/                             # ★ CORE — ADMS Protocol Handler
│   │   ├── routes.ts                     # /iclock/* route definitions
│   │   ├── handler.ts                    # Main request handler logic
│   │   ├── parser.ts                     # Parse ATTLOG, OPERLOG, device data
│   │   ├── commands.ts                   # Command builder (reboot, sync user, etc.)
│   │   ├── response.ts                   # Format protocol responses
│   │   └── constants.ts                  # Status codes, verify modes, etc.
│   │
│   ├── sync/                             # ★ OUTBOUND — Sync to HR software
│   │   ├── worker.ts                     # Background sync worker (polling loop)
│   │   ├── dispatcher.ts                 # Send data to configured targets
│   │   ├── transformer.ts               # Transform raw attendance → HR payload format
│   │   ├── retry.ts                      # Retry logic with exponential backoff
│   │   └── templates.ts                  # Payload templates for different HR systems
│   │
│   ├── api/                              # REST API for admin panel & external use
│   │   ├── routes.ts                     # Mount all API routes
│   │   ├── devices.ts                    # GET/POST/PATCH /api/devices
│   │   ├── attendance.ts                 # GET /api/attendance (with filters)
│   │   ├── commands.ts                   # POST /api/commands (send to device)
│   │   ├── sync-targets.ts              # CRUD /api/sync-targets
│   │   ├── dashboard.ts                 # GET /api/dashboard/stats
│   │   └── auth.ts                       # Simple API key or JWT auth
│   │
│   ├── admin/                            # Lightweight admin UI (server-rendered)
│   │   ├── routes.ts                     # HTML page routes
│   │   ├── pages/
│   │   │   ├── dashboard.tsx             # Overview stats page
│   │   │   ├── devices.tsx               # Device list + detail
│   │   │   ├── attendance.tsx            # Attendance log viewer
│   │   │   ├── sync.tsx                  # Sync targets + status
│   │   │   ├── commands.tsx              # Command history
│   │   │   └── login.tsx                 # Login page
│   │   ├── layouts/
│   │   │   └── main.tsx                  # Main layout with sidebar
│   │   └── components/
│   │       ├── device-card.tsx           # Device status card
│   │       ├── stats-card.tsx            # Dashboard stat card
│   │       └── table.tsx                 # Reusable data table
│   │
│   ├── db/
│   │   ├── schema.ts                     # Drizzle schema (above)
│   │   ├── index.ts                      # DB connection
│   │   └── migrate.ts                    # Migration runner
│   │
│   ├── services/                         # Business logic
│   │   ├── device.service.ts             # Device CRUD + status tracking
│   │   ├── attendance.service.ts         # Attendance storage + dedup
│   │   ├── command.service.ts            # Command queue management
│   │   └── sync.service.ts              # Sync orchestration
│   │
│   ├── jobs/                             # Background tasks
│   │   ├── device-monitor.ts             # Mark devices offline after timeout
│   │   ├── sync-scheduler.ts             # Periodic sync to HR systems
│   │   ├── command-expiry.ts             # Expire old undelivered commands
│   │   └── log-cleanup.ts               # Purge old synced attendance logs
│   │
│   ├── sse/
│   │   └── manager.ts                    # SSE connection manager for live feed
│   │
│   └── utils/
│       ├── config.ts                     # Environment config with Zod validation
│       ├── logger.ts                     # Pino logger setup
│       └── crypto.ts                     # Password hashing, API key generation
│
├── data/                                 # SQLite DB file lives here
│   └── .gitkeep
├── logs/                                 # Log files
│   └── .gitkeep
├── public/                               # Static assets for admin UI
│   ├── styles.css                        # Tailwind or simple CSS
│   └── htmx.min.js                       # HTMX for interactivity (no build step)
├── drizzle/                              # Migration files
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Core Implementation Details

### 1. ADMS Routes (the heart of the system)

```typescript
// src/adms/routes.ts
import { Hono } from 'hono';
import { handleHandshake, handleDataUpload } from './handler';

const adms = new Hono();

// Device handshake — initial registration
adms.get('/cdata', async (c) => {
  const sn = c.req.query('SN');
  const options = c.req.query('options');
  const pushver = c.req.query('pushver');
  const deviceType = c.req.query('DeviceType');

  if (!sn) return c.text('ERROR', 400);

  if (options === 'all') {
    // Handshake — auto-register device + return config
    const config = await handleHandshake(sn, {
      pushver, deviceType,
      ip: c.req.header('x-forwarded-for') || 'unknown',
    });
    return c.text(config, 200, { 'Content-Type': 'text/plain' });
  }

  return c.text('OK');
});

// Receive attendance & operation data
adms.post('/cdata', async (c) => {
  const sn = c.req.query('SN');
  const table = c.req.query('table');
  const stamp = c.req.query('Stamp');

  if (!sn) return c.text('ERROR', 400);

  // CRITICAL: Respond OK immediately, process async
  const body = await c.req.text();
  const ip = c.req.header('x-forwarded-for') || 'unknown';

  // Fire and forget — don't block the device
  handleDataUpload(sn, table, stamp, body, ip).catch(err => {
    logger.error({ err, sn, table }, 'Failed to process data upload');
  });

  return c.text('OK');
});

// Heartbeat — device polls for commands
adms.get('/getrequest', async (c) => {
  const sn = c.req.query('SN');
  if (!sn) return c.text('ERROR', 400);

  // Update last online time
  await updateDeviceOnline(sn);

  // Check for pending commands
  const commands = await getPendingCommands(sn);

  if (commands.length === 0) {
    return c.text('OK');
  }

  // Format and return commands, mark as sent
  const commandStr = commands.map(cmd => cmd.command).join('\n');
  await markCommandsSent(commands.map(cmd => cmd.id));

  return c.text(commandStr);
});

// Command results from device
adms.post('/devicecmd', async (c) => {
  const sn = c.req.query('SN');
  const body = await c.req.text();

  // Parse: ID=1&Return=0&CMD=REBOOT
  processCommandResult(sn, body).catch(err => {
    logger.error({ err, sn }, 'Failed to process command result');
  });

  return c.text('OK');
});

// Fingerprint/face template data (optional)
adms.post('/fdata', async (c) => {
  return c.text('OK');
});

export { adms };
```

### 2. Attendance Parser

```typescript
// src/adms/parser.ts

export interface AttendanceRecord {
  pin: string;
  timestamp: string;         // ISO format
  status: number;            // 0-5
  verifyMode: number;
  workCode: string;
  rawLine: string;
}

export function parseAttendanceLog(body: string): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];

  const lines = body.split(/\r?\n/).filter(line => line.trim());

  for (const line of lines) {
    try {
      const parts = line.split('\t');
      if (parts.length < 3) continue;    // Skip malformed lines

      const [pin, timestamp, status, verify, workCode] = parts;

      if (!pin || !timestamp) continue;

      records.push({
        pin: pin.trim(),
        timestamp: normalizeTimestamp(timestamp.trim()),
        status: parseInt(status?.trim() || '0', 10),
        verifyMode: parseInt(verify?.trim() || '0', 10),
        workCode: workCode?.trim() || '0',
        rawLine: line,
      });
    } catch {
      // Skip unparseable lines — defensive parsing
      continue;
    }
  }

  return records;
}

function normalizeTimestamp(ts: string): string {
  // Device sends "2024-01-15 09:30:00"
  // Convert to ISO: "2024-01-15T09:30:00"
  return ts.replace(' ', 'T');
}

export const STATUS_LABELS: Record<number, string> = {
  0: 'Check-In',
  1: 'Check-Out',
  2: 'Break-Out',
  3: 'Break-In',
  4: 'Overtime-In',
  5: 'Overtime-Out',
};

export const VERIFY_LABELS: Record<number, string> = {
  0: 'Password',
  1: 'Fingerprint',
  2: 'Card',
  4: 'Palm',
  9: 'Face',
  15: 'Face',
};
```

### 3. Sync to HR System (THE KEY DIFFERENTIATOR)

This is what makes ZK Connect a bridge, not a standalone app:

```typescript
// src/sync/dispatcher.ts

export async function syncToTarget(target: SyncTarget, records: AttendanceRecord[]) {
  const payload = transformPayload(target, records);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...JSON.parse(target.headers || '{}'),
  };

  // Add auth
  if (target.authType === 'bearer') {
    headers['Authorization'] = `Bearer ${target.authValue}`;
  } else if (target.authType === 'api_key') {
    headers['X-API-Key'] = target.authValue;
  } else if (target.authType === 'basic') {
    headers['Authorization'] = `Basic ${target.authValue}`;
  }

  const response = await fetch(target.url, {
    method: target.method || 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });

  return {
    success: response.ok,
    status: response.status,
    body: await response.text(),
  };
}

// Default payload format (can be customized per target)
function transformPayload(target: SyncTarget, records: AttendanceRecord[]) {
  if (target.payloadTemplate) {
    return applyTemplate(target.payloadTemplate, records);
  }

  // Default format — clean JSON array
  return {
    source: 'zk-connect',
    syncedAt: new Date().toISOString(),
    deviceRecords: records.map(r => ({
      employeePin: r.pin,
      punchTime: r.timestamp,
      punchType: r.status === 0 ? 'IN' : r.status === 1 ? 'OUT' : `STATUS_${r.status}`,
      verificationMethod: VERIFY_LABELS[r.verifyMode] || 'Unknown',
      deviceSerialNumber: r.deviceSN,
      deviceName: r.deviceName,
      locationName: r.locationName,
    })),
  };
}
```

### 4. Sync Worker (Background Loop)

```typescript
// src/sync/worker.ts

export function startSyncWorker(intervalMs = 10000) {
  logger.info(`Sync worker started, interval: ${intervalMs}ms`);

  setInterval(async () => {
    try {
      // Get all active sync targets
      const targets = await db.select().from(syncTargets)
        .where(eq(syncTargets.isActive, true));

      for (const target of targets) {
        // Get unsyncted records in batches
        const pending = await db.select().from(attendanceLogs)
          .where(eq(attendanceLogs.syncStatus, 'pending'))
          .orderBy(asc(attendanceLogs.timestamp))
          .limit(target.batchSize || 50);

        if (pending.length === 0) continue;

        // Try to sync
        const result = await syncToTarget(target, pending);

        if (result.success) {
          // Mark records as synced
          const ids = pending.map(r => r.id);
          await db.update(attendanceLogs)
            .set({ syncStatus: 'synced', syncedAt: new Date().toISOString() })
            .where(inArray(attendanceLogs.id, ids));

          // Log success
          await logSync(target.id, pending.length, 'success', result.status);
          logger.info({ target: target.name, count: pending.length }, 'Sync successful');
        } else {
          // Increment retry counter, mark failed if exceeded
          await handleSyncFailure(pending, target, result);
        }
      }
    } catch (err) {
      logger.error({ err }, 'Sync worker error');
    }
  }, intervalMs);
}
```

### 5. Device Monitor (Background)

```typescript
// src/jobs/device-monitor.ts

export function startDeviceMonitor(intervalMs = 30000) {
  setInterval(async () => {
    const threshold = new Date(Date.now() - 90000).toISOString(); // 90s timeout

    // Mark stale devices as offline
    await db.update(devices)
      .set({ isOnline: false })
      .where(and(
        eq(devices.isOnline, true),
        lt(devices.lastOnline, threshold)
      ));

    // Expire old pending commands (older than 10 minutes)
    const cmdThreshold = new Date(Date.now() - 600000).toISOString();
    await db.update(deviceCommands)
      .set({ status: 'expired' })
      .where(and(
        eq(deviceCommands.status, 'pending'),
        lt(deviceCommands.createdAt, cmdThreshold)
      ));
  }, intervalMs);
}
```

### 6. SSE for Real-time Dashboard

```typescript
// src/sse/manager.ts
type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
};

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();

  addClient(id: string, controller: ReadableStreamDefaultController) {
    this.clients.set(id, { id, controller, encoder: new TextEncoder() });
  }

  removeClient(id: string) {
    this.clients.delete(id);
  }

  broadcast(event: string, data: any) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [id, client] of this.clients) {
      try {
        client.controller.enqueue(client.encoder.encode(message));
      } catch {
        this.clients.delete(id);
      }
    }
  }
}

export const sseManager = new SSEManager();
```

Events emitted:
- `attendance:new` — when new punch comes in (real-time feed)
- `device:online` — when device connects/heartbeats
- `device:offline` — when device goes dark
- `sync:complete` — when batch sync to HR succeeds
- `command:result` — when device responds to a command

---

## Admin Panel Pages

Use Hono's built-in JSX for server-rendered HTML. Include HTMX for dynamic updates without React/Vue.

### Dashboard (`/admin/`)
- Total devices online/offline (big number cards)
- Today's punch count
- Sync status (pending | synced | failed counts)
- Last 10 attendance entries (auto-refresh via SSE)
- Device status grid

### Devices (`/admin/devices`)
- Table: Serial Number, Name, Model, Location, Status (green/red dot), Last Seen, Actions
- Click → device detail page
- Device detail: Info card + Command buttons (Reboot, Sync Time, Get Info) + Attendance from this device

### Attendance (`/admin/attendance`)
- Filterable table: Date range, Device, PIN, Status, Sync Status
- Export CSV button
- Color coding: synced=green, pending=yellow, failed=red

### Live Feed (`/admin/live`)
- Real-time attendance punches via SSE
- Shows: Time, PIN, Name (if known), Device, Status, Verify Method
- Auto-scrolling

### Sync Targets (`/admin/sync`)
- List configured HR system webhooks
- Add/Edit form: Name, URL, Auth type, Headers, Batch size, Active toggle
- Test button (sends sample payload)
- Sync log history per target

### Commands (`/admin/commands`)
- Command history table: Device, Command, Status, Sent At, Result
- Send command form: Select device, choose command type, parameters

---

## REST API (for external integrations)

Protected with API key header (`X-API-Key`):

```
# Devices
GET    /api/devices                    → List all devices
GET    /api/devices/:id                → Device detail
PATCH  /api/devices/:id                → Update device (name, location)

# Attendance
GET    /api/attendance                 → List logs (query: from, to, device, pin, status, sync_status, limit, offset)
GET    /api/attendance/stats           → Aggregate stats

# Commands
POST   /api/commands                   → Send command to device
GET    /api/commands                   → Command history

# Sync
GET    /api/sync-targets               → List sync targets
POST   /api/sync-targets               → Create sync target
PATCH  /api/sync-targets/:id           → Update sync target
POST   /api/sync-targets/:id/test      → Test sync target with sample data
POST   /api/sync/trigger               → Manually trigger sync now

# Dashboard
GET    /api/dashboard/stats            → Overview numbers
GET    /api/sse                        → SSE stream for real-time events
```

---

## Environment Variables

```env
# Server
PORT=8080
HOST=0.0.0.0
NODE_ENV=production

# Database
DATABASE_PATH=./data/zkconnect.db

# Admin Auth
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme123
API_KEY=your-api-key-here

# Sync Worker
SYNC_INTERVAL_MS=10000
SYNC_RETRY_ATTEMPTS=3
SYNC_RETRY_DELAY_MS=5000

# Device Monitoring
DEVICE_OFFLINE_TIMEOUT_MS=90000
COMMAND_EXPIRY_MS=600000

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/zkconnect.log
```

---

## Docker Setup

```dockerfile
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY dist/ ./dist/
COPY public/ ./public/

RUN mkdir -p data logs

EXPOSE 8080

CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  zkconnect:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data        # Persist SQLite DB
      - ./logs:/app/logs        # Persist logs
    environment:
      - PORT=8080
      - NODE_ENV=production
      - ADMIN_PASSWORD=changeme123
      - API_KEY=your-api-key-here
    restart: unless-stopped
```

---

## Key Design Principles

1. **Device-first reliability**: ALWAYS respond `OK` to device immediately. Never let DB errors or sync failures block device communication.

2. **Async everything**: Parse and store attendance asynchronously after responding to device. Use fire-and-forget with error logging.

3. **Defensive parsing**: ZKTeco firmware varies wildly. Parse what we can, skip what we can't. Never crash on malformed data.

4. **Bridge, not warehouse**: Data ultimately belongs in the HR system. ZK Connect is a buffer with retry logic. Old synced records can be purged.

5. **Zero-config devices**: Auto-register on first handshake. Admin just configures device name/location after it appears.

6. **Configurable sync**: Support multiple HR systems simultaneously. Each sync target has its own URL, auth, payload format, and batch settings.

7. **Observable**: Structured logging (Pino), SSE real-time feed, sync status tracking, command audit trail.

---

## Development Order (Priority)

```
Phase 1 — Protocol Core (Get devices talking)
  1. Project setup (Hono + Drizzle + SQLite + TypeScript)
  2. Database schema + migrations
  3. ADMS protocol endpoints (/iclock/*)
  4. Attendance parser
  5. Device auto-registration
  6. Test with simulated device requests (Postman/curl)

Phase 2 — Sync Engine (Get data flowing to HR)
  7. Sync targets CRUD
  8. Sync worker (background loop)
  9. Sync dispatcher with retry logic
  10. Payload transformer (configurable per target)

Phase 3 — Device Management
  11. Command queue system
  12. Command builder helpers
  13. Device status monitoring

Phase 4 — Admin Panel
  14. Login page + session auth
  15. Dashboard page
  16. Devices page + detail
  17. Attendance log viewer
  18. Sync status page
  19. SSE real-time feed

Phase 5 — Production Hardening
  20. Docker setup
  21. Log rotation
  22. Rate limiting
  23. API key auth for REST endpoints
  24. Data retention/cleanup job
  25. Health check endpoint
```

**Start with Phase 1. Nothing else matters until devices can connect and push data.**

---

## Testing Without a Physical Device

Use curl/Postman to simulate device requests:

```bash
# 1. Simulate device handshake
curl "http://localhost:8080/iclock/cdata?SN=TEST001&options=all&pushver=2.4.0&DeviceType=test"

# 2. Simulate attendance upload
curl -X POST "http://localhost:8080/iclock/cdata?SN=TEST001&table=ATTLOG&Stamp=9999" \
  -d $'1001\t2024-01-15 09:30:00\t0\t1\t0\t0\t0\n1002\t2024-01-15 09:31:00\t1\t15\t0\t0\t0'

# 3. Simulate heartbeat (should return OK or commands)
curl "http://localhost:8080/iclock/getrequest?SN=TEST001"

# 4. Simulate command result
curl -X POST "http://localhost:8080/iclock/devicecmd?SN=TEST001" \
  -d 'ID=1&Return=0&CMD=REBOOT'
```

Include a test script that simulates a full device lifecycle for development.
