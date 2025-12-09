# Agent Guidelines

This document contains guidelines for AI agents working on this codebase.

---

## Communication Guidelines

### Be Concise by Default

**Keep all responses brief and focused. The user will ask for more details if
needed.**

**General Conversation:**

- Give direct, concise answers
- Avoid unnecessary explanations or elaboration
- Don't show code examples unless specifically requested
- Trust the user to ask follow-up questions

**After Completing Tasks:**

- Summarize in one sentence: "Created 3 decision documents and updated
  ARCHITECTURE.md."
- Don't list every file change or explain each decision unprompted
- Don't show code snippets unless relevant and requested

**Examples:**

✅ **Good** (Concise):

> "Added authentication check to the API endpoint."

❌ **Bad** (Too verbose):

> "I've added an authentication check to the API endpoint. This is important
> because we need to ensure that only authenticated users can access this
> resource. I used the Better-auth session validation pattern, which checks the
> session headers and returns a 401 error if the user is not authenticated.
> Here's the code I added: [long code block]..."

**When to be detailed:**

- User explicitly asks "how?", "why?", or "show me"
- Explaining complex architectural decisions (but still be structured and clear)
- User asks for clarification or more information

---

## Agent Documentation

- **Decisions**: `agent/decisions/YYYY_MM_DD_topic.md`
- **Summaries**: `agent/summaries/` (implementation notes, test strategies)
- **Temporary files**: `agent/tmp/` (not committed)
- Keep `agent/ARCHITECTURE.md` high-level; details go in decision files

---

## Documentation Search

Use `context7` tools: resolve library ID first, then fetch docs.

---

## Dependency Management in package.json

**EVERY dependency, except peerDependencies should be a fixed number!** Do not prefix them with ^ or ~ to ensure locked versions.

---

## Bun Catalogs

Bun catalogs allow centralized dependency management in monorepos:

- **Definition**: Root `package.json` defines named catalogs in `"catalogs"` section
- **Caution**: the property "catalog" (without s) does also exist, but we're not using it right now! We only have one catalog right now, called "dev". 
- **Usage**: Workspace packages reference catalog entries with `"catalog:name"` syntax
- **Benefits**: Single source of truth for shared dependencies, consistent versions across workspaces
- **Example**: Root defines `"dev": {"@types/node": "24.10.2"}`, packages use `"@types/node": "catalog:dev"`

---

## Installing Packages

If you need to install packages for one package:
- install them in the package.json for this specific package, like core

If you need to install node packages for multiple packages in the monorepo:
- add them to a named catalog in the root package.json and reference them in the child packages via "catalog:<catalogName>"

Check with context7 that you add the latest version of a library!

After adding, run "bun i" in the repository root to install the dependencies.

---
