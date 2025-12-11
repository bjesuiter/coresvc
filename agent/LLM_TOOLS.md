# LLM Core Tools Design

> Minimal toolset for the LLM core — optimize for clarity and reduced context clutter.

## Design Principles

1. **Minimal surface area** — fewer tools = better tool selection by LLM
2. **Composable** — tools can be combined for complex tasks
3. **Typed schemas** — clear input/output contracts
4. **Fail gracefully** — errors should be informative, not catastrophic

---

## Tool 1: `search`

**Purpose:** Acquire up-to-date information from the internet.

```typescript
interface SearchTool {
  name: "search";
  description: "Search the internet for current information";
  parameters: {
    query: string;           // Natural language search query
    type?: "web" | "news";   // Default: "web"
    max_results?: number;    // Default: 5, max: 10
  };
  returns: {
    results: Array<{
      title: string;
      url: string;
      snippet: string;
      date?: string;         // For news results
    }>;
  };
}
```

**Implementation options:**
- SearXNG (self-hosted, privacy-focused)
- Brave Search API
- Tavily (AI-optimized search)
- DuckDuckGo (unofficial API)

---

## Tool 2: `code`

**Purpose:** Generate, execute, and manage code via OpenCode.

### Option A: Single Unified Tool (Recommended)

```typescript
interface CodeTool {
  name: "code";
  description: "Write, execute, or manage code. Uses OpenCode for generation.";
  parameters: {
    action: "generate" | "execute" | "status";
    
    // For "generate":
    task?: string;           // Natural language description of what to code
    context?: string;        // Relevant context (files, requirements)
    
    // For "execute":
    code?: string;           // Inline ESM module to run (if no task)
    timeout_ms?: number;     // Default: 30000
    
    // For "status":
    job_id?: string;         // Check status of async generation
  };
  returns: {
    success: boolean;
    result?: unknown;        // Execution result or generated code
    error?: string;
    job_id?: string;         // For async operations
  };
}
```

### Option B: Separate Tools

If context becomes too complex, split into:
- `code_generate` — OpenCode task submission
- `code_execute` — Run inline ESM or stored scripts

### Inline Code Execution via Bun Stdin

LLM generates a top-level ESM module as a string, piped to `bun run -` via stdin.
No filesystem, no eval, proper subprocess isolation.

**Reference:** https://bun.sh/docs/runtime#bun-run-to-pipe-code-from-stdin

```typescript
// LLM generates this as a string (top-level module)
const code = `
  const response = await fetch('https://api.example.com/data');
  const data = await response.json();
  console.log(JSON.stringify(data));  // Output via stdout
`;

// Piped to: echo "$code" | bun run -
```

**Benefits:**
- No eval() or dynamic import() hacks
- True subprocess isolation
- Native Bun feature, stable
- Captures stdout/stderr cleanly
- Can enforce timeouts via subprocess

**Implementation:**

```typescript
import { spawn } from 'bun';

interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  // For tracing
  executionId: string;
  code: string;
  timestamp: Date;
}

async function executeCode(
  code: string, 
  options: { timeoutMs?: number; env?: Record<string, string> } = {}
): Promise<ExecutionResult> {
  const { timeoutMs = 30_000, env = {} } = options;
  const executionId = crypto.randomUUID();
  const startTime = Date.now();
  
  const proc = spawn({
    cmd: ['bun', 'run', '-'],
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...env },
  });
  
  // Write code to stdin and close
  const writer = proc.stdin.getWriter();
  await writer.write(new TextEncoder().encode(code));
  await writer.close();
  
  // Race between completion and timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      proc.kill();
      reject(new Error(`Execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  try {
    const [stdout, stderr, exitCode] = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]),
      timeoutPromise,
    ]);
    
    const result: ExecutionResult = {
      success: exitCode === 0,
      stdout,
      stderr,
      exitCode,
      durationMs: Date.now() - startTime,
      executionId,
      code,
      timestamp: new Date(),
    };
    
    // Log for tracing (always, not just on error)
    await traceExecution(result);
    
    return result;
  } catch (error) {
    const result: ExecutionResult = {
      success: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: -1,
      durationMs: Date.now() - startTime,
      executionId,
      code,
      timestamp: new Date(),
    };
    
    await traceExecution(result);
    return result;
  }
}
```

### Code Execution Tracing

Every execution gets logged for observability and system prompt improvement.

**Schema:**

```typescript
// In db/schema.ts
export const codeExecutions = sqliteTable('code_executions', {
  id: text('id').primaryKey(),                    // UUID
  code: text('code').notNull(),                   // The generated code
  stdout: text('stdout'),
  stderr: text('stderr'),
  exitCode: integer('exit_code'),
  durationMs: integer('duration_ms'),
  success: integer('success', { mode: 'boolean' }),
  
  // Context for debugging
  sessionId: text('session_id'),                  // Which chat session
  triggerMessage: text('trigger_message'),        // What user asked
  llmReasoning: text('llm_reasoning'),            // Why LLM generated this code
  
  // For pattern analysis
  errorCategory: text('error_category'),          // 'syntax', 'runtime', 'timeout', 'import'
  
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`),
});
```

**Tracing implementation:**

```typescript
import { db } from './db';
import { codeExecutions } from './db/schema';

async function traceExecution(
  result: ExecutionResult,
  context?: { sessionId?: string; triggerMessage?: string; llmReasoning?: string }
): Promise<void> {
  // Categorize errors for pattern analysis
  const errorCategory = result.success ? null : categorizeError(result.stderr);
  
  await db.insert(codeExecutions).values({
    id: result.executionId,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    success: result.success,
    sessionId: context?.sessionId,
    triggerMessage: context?.triggerMessage,
    llmReasoning: context?.llmReasoning,
    errorCategory,
  });
}

function categorizeError(stderr: string): string {
  if (!stderr) return 'unknown';
  
  if (stderr.includes('SyntaxError')) return 'syntax';
  if (stderr.includes('Cannot find module') || stderr.includes('not found')) return 'import';
  if (stderr.includes('TypeError')) return 'type';
  if (stderr.includes('ReferenceError')) return 'reference';
  if (stderr.includes('timed out')) return 'timeout';
  if (stderr.includes('fetch failed') || stderr.includes('ECONNREFUSED')) return 'network';
  
  return 'runtime';
}
```

**Querying for system prompt improvements:**

```typescript
// Get most common error patterns
async function getErrorPatterns(days = 7) {
  return db.select({
    errorCategory: codeExecutions.errorCategory,
    count: sql<number>`count(*)`,
    examples: sql<string>`group_concat(substr(code, 1, 200), '---')`,
  })
  .from(codeExecutions)
  .where(and(
    eq(codeExecutions.success, false),
    gt(codeExecutions.createdAt, sql`datetime('now', '-${days} days')`)
  ))
  .groupBy(codeExecutions.errorCategory)
  .orderBy(sql`count(*) desc`);
}

// Get failed executions for a session (for debugging)
async function getSessionFailures(sessionId: string) {
  return db.select()
    .from(codeExecutions)
    .where(and(
      eq(codeExecutions.sessionId, sessionId),
      eq(codeExecutions.success, false)
    ))
    .orderBy(codeExecutions.createdAt);
}
```

**Telegram command for tracing visibility:**

```typescript
// /codestats - show recent execution stats
bot.command('codestats', async (ctx) => {
  const stats = await db.select({
    total: sql<number>`count(*)`,
    successful: sql<number>`sum(case when success = 1 then 1 else 0 end)`,
    failed: sql<number>`sum(case when success = 0 then 1 else 0 end)`,
    avgDuration: sql<number>`avg(duration_ms)`,
  })
  .from(codeExecutions)
  .where(gt(codeExecutions.createdAt, sql`datetime('now', '-7 days')`));
  
  const errors = await getErrorPatterns(7);
  
  return ctx.reply(`📊 Code Execution Stats (7 days)
  
Total: ${stats[0].total}
✅ Success: ${stats[0].successful}
❌ Failed: ${stats[0].failed}
⏱ Avg duration: ${Math.round(stats[0].avgDuration)}ms

Top error categories:
${errors.map(e => `  • ${e.errorCategory}: ${e.count}`).join('\n')}`);
});

// /codefailures [n] - show last n failures with code
bot.command('codefailures', async (ctx) => {
  const limit = parseInt(ctx.match) || 5;
  
  const failures = await db.select()
    .from(codeExecutions)
    .where(eq(codeExecutions.success, false))
    .orderBy(sql`created_at desc`)
    .limit(limit);
  
  if (failures.length === 0) {
    return ctx.reply('No recent failures! 🎉');
  }
  
  for (const f of failures) {
    await ctx.reply(`❌ ${f.id.slice(0, 8)}
Category: ${f.errorCategory}
Time: ${f.createdAt}

Code:
\`\`\`javascript
${f.code.slice(0, 500)}${f.code.length > 500 ? '...' : ''}
\`\`\`

Error:
\`\`\`
${f.stderr.slice(0, 300)}
\`\`\``, { parse_mode: 'Markdown' });
  }
});
```

---

## Tool 3: `memory`

**Purpose:** Store and retrieve information across different time horizons.

```typescript
interface MemoryTool {
  name: "memory";
  description: "Store and recall information at different time scales";
  parameters: {
    action: "store" | "recall" | "list" | "forget";
    
    // For "store":
    layer: "long" | "mid" | "short" | "session";
    content?: string;
    category?: string;       // For long-term: "fact", "preference", "relationship"
                             // For mid-term: "goal", "plan", "project"
    certainty?: number;      // 0-1, for goals/plans
    
    // For "recall":
    query?: string;          // Semantic search across memories
    layer?: string;          // Filter by layer
    limit?: number;          // Default: 10
    
    // For "forget":
    memory_id?: string;
  };
  returns: {
    success: boolean;
    memories?: Array<{
      id: string;
      layer: string;
      content: string;
      category?: string;
      certainty?: number;
      created_at: string;
      relevance?: number;    // For recall results
    }>;
  };
}
```

### Memory Layers Detailed

| Layer | TTL | Purpose | Examples |
|-------|-----|---------|----------|
| **long** | Permanent | Hard facts, preferences, relationships | "Works at X", "Married to Y", "Prefers dark mode" |
| **mid** | 1-3 months | Goals, plans, projects | "Learning Rust", "Launching product Q1", "Saving for house" |
| **short** | Days/weeks | Recent context, conversation summaries | "Was debugging auth issue", "Discussed vacation plans" |
| **session** | Current chat | Active task context, temporary state | "Working on this PR", "Currently in refactor mode" |

### Session Division for Telegram

```typescript
interface SessionConfig {
  // Automatic division
  auto_divide: "daily" | "weekly" | "none";  // Default: "daily"
  auto_divide_time: string;                   // e.g., "00:00" (midnight)
  
  // Manual division
  // Via Telegram: /newsession [name]
  // Via LLM: "Let's start a new session for [topic]"
}
```

**Implementation:**
```typescript
// Telegram command handler
bot.command('newsession', async (ctx) => {
  const sessionName = ctx.match || `Session ${Date.now()}`;
  await endCurrentSession(ctx.from.id);
  await startNewSession(ctx.from.id, sessionName);
  return ctx.reply(`Started new session: ${sessionName}`);
});

// LLM can also trigger via tool call
// memory({ action: "store", layer: "session", content: "__NEW_SESSION__", category: "system" })
```

**Auto-division cron (runs at configured time):**
```typescript
// In scheduler
cron.schedule('0 0 * * *', async () => {  // Daily at midnight
  await archiveExpiredSessions();
});
```

---

## Tool Schema Summary

```typescript
const LLM_TOOLS = [
  {
    name: "search",
    description: "Search the internet for current information. Use for facts, news, documentation.",
  },
  {
    name: "code", 
    description: "Generate or execute code. Generate: describe what you need. Execute: provide inline ESM module.",
  },
  {
    name: "memory",
    description: "Store/recall information. Layers: long (facts), mid (goals), short (recent), session (current).",
  }
] as const;
```

**Total: 3 tools** — minimal, powerful, composable.

---

## Alternative Considerations

### Should `code` be split?

**Keep unified if:**
- LLM rarely confuses generate vs execute
- Context length isn't an issue
- Simpler tool schema

**Split if:**
- LLM frequently miscalls the tool
- You need different auth/permissions per action
- OpenCode operations are long-running and need separate handling

### Read-Only vs Read-Write Tools

Consider adding explicit capability hints:
```typescript
const TOOL_CAPABILITIES = {
  search: { reads: ['internet'], writes: [] },
  code: { reads: ['files'], writes: ['files', 'execution'] },
  memory: { reads: ['memory'], writes: ['memory'] },
};
```

This helps with:
- Permission management
- Audit logging
- User consent flows

---

## Future Tools (Keep Out for Now)

These might be needed later but would clutter the initial setup:

| Tool | Purpose | When to Add |
|------|---------|-------------|
| `notify` | Send proactive messages | When background jobs exist |
| `calendar` | Schedule/query events | When calendar integration exists |
| `file` | Direct file operations | If code tool isn't enough |
| `api` | Call arbitrary HTTP endpoints | If inline ESM isn't flexible enough |

---

## Open Questions

1. **Code sandboxing**: How strict? Bun subprocess vs in-process?
2. **Memory embedding**: Use vector DB for semantic recall? (SQLite + sqlite-vec?)
3. **Tool chaining**: Should LLM be able to chain tools in one turn, or one-at-a-time?
4. **Rate limiting**: Per-tool limits to prevent runaway?
5. **Audit trail**: Log all tool calls for debugging/safety?
