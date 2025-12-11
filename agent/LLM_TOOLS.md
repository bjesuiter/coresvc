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

### Inline ESM Execution (Your Idea — Love It!)

Instead of file-based script management, the LLM generates a complete ESM module as a string:

```typescript
// LLM generates this as a string
const inlineModule = `
  export default async function() {
    const response = await fetch('https://api.example.com/data');
    return response.json();
  }
`;

// Runtime executes it
const result = await executeInlineESM(inlineModule);
```

**Benefits:**
- No file system pollution
- Sandboxed execution
- Stateless and reproducible
- Easy to audit (code is in the conversation)

**Implementation:**
```typescript
async function executeInlineESM(code: string, timeout = 30000) {
  // Create a data URL from the code
  const blob = new Blob([code], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  
  try {
    // Dynamic import with timeout
    const module = await Promise.race([
      import(url),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);
    
    // Execute the default export if it's a function
    if (typeof module.default === 'function') {
      return await module.default();
    }
    return module.default;
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

**Bun alternative (better sandboxing):**
```typescript
import { spawn } from 'bun';

async function executeInlineESM(code: string) {
  const proc = spawn({
    cmd: ['bun', 'run', '-'],
    stdin: new TextEncoder().encode(code),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  
  return { output, exitCode };
}
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
