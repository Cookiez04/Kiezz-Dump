# KiezzDump v1

**Local-first personal search & dump tool**

## Project Goal

Build a **zero-friction personal dump** for text, links, and thoughts that is:

- searchable instantly
- stored locally using IndexedDB
- fast, minimal, and boring in a good way

This is not a notes app.  
This is not a knowledge base.  
This is a **searchable brain exhaust**.

## Non-Goals (read this twice)

KiezzDump v1 will **not** include:

- sync
- accounts
- folders
- markdown rendering
- AI
- tags management UI
- analytics
- onboarding
- mobile app wrappers

If it’s not necessary to dump and search text, it does not exist.

## Supported Platforms

- Modern desktop browsers (Chrome, Firefox, Edge)
- Mobile browser support is best-effort
- No PWA requirements for v1

## Data Model

### Entry Object

Each entry is stored as a single record.

```
Entry {
  id: string (UUID)
  content: string
  title: string | null
  tags: string[]
  createdAt: number (timestamp)
  updatedAt: number (timestamp)
}
```

### Storage

- IndexedDB
- Database name: `kiezzdump` (haha dump)
- Object store: `entries`
- Primary key: `id`
- Indexes:
  - `content`
  - `tags`
  - `createdAt`

## Core Features

### 1. Universal Input

- Single input field at the top
- Accepts pasted text or typed text
- Press `Enter` to submit when input is not empty

Behavior:

- Content is saved immediately
- Title auto-generated from first line or first 40 chars
- Tags parsed automatically from `#tag` syntax
- Input clears after save
- Entry appears at top of results

### 2. Tag Parsing (Implicit)

- Tags are defined inline using `#`
- Example:

```
learn indexeddb #web #idea
```

Rules:

- Tags are lowercased
- Stored without `#`
- No validation UI
- No tag editor in v1

### 3. Search

- Search runs on every keystroke
- Case-insensitive
- Matches against:
  - content
  - title
  - tags

Implementation:

- Load all entries into memory on startup
- Filter in memory for v1
- No ranking algorithm beyond simple match order

### 4. Results List

Each result shows:

- Title or truncated content
- Tags (if any)
- Created date (relative, e.g. “2 days ago”)

Sorting:

- Newest first by default
- No manual sorting

### 5. Entry Viewer / Editor

Clicking a result:

- Opens entry in a simple editor view
- Content editable in place
- Changes auto-saved on blur or debounce

Actions:

- Delete entry (with confirmation)
- No version history

### 6. Keyboard Shortcuts

Mandatory:

- `/` → focus input/search
- `Enter` → add entry
- `Esc` → clear input or close editor

Optional:

- `Cmd/Ctrl + Backspace` → delete entry (while open)

### 7. Persistence & Load

On app load:

- Open IndexedDB
- Fetch all entries
- Render results list
- No loading spinner beyond minimal text

## UI & UX Guidelines

### Visual Style

- Minimal but modern
- Dark mode default (matte)
- Neutral colors (no neon please, i hate it)
- Few quirky easter egg that is goofy

Layout:

- Top input bar
- Scrollable results list
- Overlay or inline editor

### Copy & Microcopy

Tone:

- Neutral
- Functional
- Occasional Poop Humor
- No onboarding text

One small footer line:

> Data is dumped locally in this browser.

## Error Handling

- IndexedDB failure shows a simple error message
- No retries
- No silent failure

## File Structure (suggested)

```
/index.html
/styles.css
/db.js        // IndexedDB wrapper
/app.js       // logic
/ui.js        // rendering
/utils.js     // helpers
```

No build step required.

## Definition of Done

KiezzDump v1 is complete when:

- Entries can be added
- Entries persist after refresh
- Search works instantly
- Entries can be edited and deleted
- No console errors
- App is usable daily

If it survives one week of real usage, it passes.

## Post-v1 Ideas (explicitly not part of this build)

- Export / Import
- Encryption
- Sync
- Fuzzy search
- Mobile polish
- PWA
- Backlinks

## Final Contractor Instruction

Build it **ugly but solid**.  
Do not over-engineer.  
Do not optimize early.  
Do not add features “because it’s easy”.

Deliver something boring that works.

That’s how KiezzDump becomes a tool instead of a dead repo.
