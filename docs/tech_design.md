# LearnTok: Technical Design

## Architecture

LearnTok follows a standard three tier architecture optimized for a hackathon: a React frontend, a Node.js API layer, and Azure managed services for AI and persistence.

```
┌─────────────────────────────────────────────────────┐
│                      User (Browser)                 │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────┐
│              Next.js Frontend (apps/web)             │
│                                                      │
│  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │
│  │ Feed View   │  │ Topic Input│  │ Session Mgmt  │  │
│  │ (snap scroll│  │ (search bar│  │ (resume, back)│  │
│  │  full page) │  │  + URL)    │  │               │  │
│  └────────────┘  └────────────┘  └───────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │ REST API calls
┌──────────────────────▼──────────────────────────────┐
│              Express API (apps/api)                   │
│                                                      │
│  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │
│  │ Session     │  │ Sip        │  │ AI Pipeline   │  │
│  │ Controller  │  │ Controller │  │ (skeleton +   │  │
│  │             │  │            │  │  card gen)    │  │
│  └─────┬──────┘  └─────┬──────┘  └──────┬────────┘  │
└────────┼────────────────┼────────────────┼───────────┘
         │                │                │
    ┌────▼────┐     ┌────▼────┐     ┌─────▼──────┐
    │Cosmos DB│     │Cosmos DB│     │Azure OpenAI│
    │Sessions │     │Sips     │     │GPT-4o      │
    └─────────┘     └─────────┘     └────────────┘
```

## Design Choices

### Why Next.js (App Router)

- Server side rendering for fast initial load
- App Router provides layouts, loading states, and streaming out of the box
- React Server Components reduce client bundle size
- Built in API routes available as fallback if Express is overkill for some endpoints
- Strong TypeScript support

### Why Express (separate API)

- Decouples frontend from backend, allowing independent scaling
- Easier to test AI pipelines and API logic in isolation
- Hackathon flexibility: can swap frontend without touching API
- Express is minimal and fast to set up

### Why pnpm Workspaces

- Single repository, single install, single `pnpm dev` command
- Shared TypeScript types between frontend and backend via a shared package
- No overhead of Lerna or Nx for a small hackathon project
- Faster installs than npm or yarn

### Why Cosmos DB

- Flexible schema fits the evolving shape of learning sips during rapid prototyping
- Session and sip data are naturally document shaped (nested JSON)
- Built in TTL for auto cleanup of old hackathon data
- Partition key on `sessionId` gives good performance for our access patterns
- Free tier available for hackathon use

### Why Azure OpenAI (GPT-4o)

- High quality text generation for educational content
- JSON mode ensures structured output for skeleton and sip generation
- Internal Microsoft service, no external API key management
- Low latency when deployed in the same Azure region as other services

## AI Pipeline Design

The AI pipeline has two stages, each backed by a separate Azure OpenAI call.

### Stage 1: Topic to Skeleton

**Input:** A topic string (e.g., "Azure Functions") or a Microsoft Learn URL.

**Process:**
1. If a URL is provided, extract the module/unit title and description from the URL path
2. Send to Azure OpenAI with a system prompt that instructs it to create a learning outline
3. Parse the JSON response into a skeleton array

**System prompt (summary):**
> You are a curriculum designer. Given a technical topic, create a learning skeleton as a JSON array. Each node has: id, title, parentId (null for root), depth (0 to 2), order, and a one sentence description. Aim for 10 to 20 nodes covering fundamentals first, then intermediate concepts.

**Output schema:**
```json
[
  {
    "id": "node-1",
    "title": "What are Azure Functions?",
    "parentId": null,
    "depth": 0,
    "order": 1,
    "description": "Serverless compute service that runs code in response to events."
  }
]
```

### Stage 2: Skeleton Node to Learning Sip

**Input:** A single skeleton node plus the full skeleton for context.

**Process:**
1. Send the node and surrounding context to Azure OpenAI
2. Request a self contained learning sip in 100 to 200 words
3. Optionally request an interaction (quiz question, fill in the blank, or key takeaway)

**System prompt (summary):**
> You are a technical educator. Given a skeleton node and its context, generate a learning sip. The sip must be self contained (no prior reading required), 100 to 200 words, conversational in tone, and include one interaction element. Output as JSON.

**Output schema:**
```json
{
  "title": "What is a Trigger?",
  "content": "Every Azure Function starts with a trigger...",
  "interactionType": "quiz",
  "interaction": {
    "question": "Which of these is NOT a trigger type?",
    "options": ["HTTP", "Timer", "Bluetooth", "Queue"],
    "answer": "Bluetooth"
  },
  "visualHint": "icon:lightning"
}
```

### Pre generation Strategy

To keep the scroll feeling instant:
1. On session creation, generate the first 5 sips immediately (user waits for this, ~3 to 5 seconds)
2. After delivering the first batch, trigger background generation of the next 5
3. On each scroll event that crosses the 70% threshold, trigger another batch
4. When a user likes a sip, insert an "expand" job that generates 2 to 3 deeper sips and splices them into the queue

## Data Models

### Container: sessions (partition key: /id)

```json
{
  "id": "uuid",
  "userId": "uuid",
  "topic": "Azure Functions",
  "sourceUrl": "https://learn.microsoft.com/en-us/azure/azure-functions/",
  "skeleton": [ ... ],
  "sipQueue": ["sip-1", "sip-2", "sip-3"],
  "currentIndex": 0,
  "status": "active | paused | completed",
  "createdAt": "2026-04-15T12:00:00Z",
  "updatedAt": "2026-04-15T12:05:00Z"
}
```

### Container: sips (partition key: /sessionId)

```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "skeletonNodeId": "node-1",
  "order": 1,
  "title": "What is a Trigger?",
  "content": "Every Azure Function starts with a trigger...",
  "interactionType": "quiz",
  "interaction": {
    "question": "Which is NOT a trigger type?",
    "options": ["HTTP", "Timer", "Bluetooth", "Queue"],
    "answer": "Bluetooth"
  },
  "visualHint": "icon:lightning",
  "depth": 0,
  "userReaction": null,
  "createdAt": "2026-04-15T12:00:01Z"
}
```

`userReaction` values: `null` (not yet seen), `"liked"`, `"skipped"`, `"bookmarked"`

### Container: users (partition key: /id)

```json
{
  "id": "uuid",
  "displayName": "Hackathon User",
  "activeSessions": ["session-uuid"],
  "totalSipsViewed": 0,
  "streak": 0,
  "bookmarks": [],
  "createdAt": "2026-04-15T12:00:00Z"
}
```

For the hackathon, a single hardcoded user document is seeded on first run.

## API Contracts

### POST /api/sessions

Create a new learning session from a topic or URL.

**Request:**
```json
{
  "topic": "Azure Functions",
  "sourceUrl": "https://learn.microsoft.com/..."  // optional
}
```

**Response (201):**
```json
{
  "id": "session-uuid",
  "topic": "Azure Functions",
  "skeleton": [ ... ],
  "sips": [ ... ]   // first 5 sips, pre generated
}
```

### GET /api/sessions/:id/sips?after=4&limit=5

Get the next batch of sips for a session.

**Response (200):**
```json
{
  "sips": [ ... ],
  "hasMore": true,
  "currentIndex": 9
}
```

### POST /api/sips/:id/interact

Record a user interaction with a sip.

**Request:**
```json
{
  "reaction": "liked"   // "liked" | "skipped" | "bookmarked"
}
```

**Response (200):**
```json
{
  "ok": true,
  "queueUpdated": true,
  "newSipsAdded": 3    // if liked, deeper sips were generated
}
```

### GET /api/sessions/:id

Get session state (for resume).

**Response (200):**
```json
{
  "id": "session-uuid",
  "topic": "Azure Functions",
  "currentIndex": 5,
  "status": "active",
  "totalSips": 15
}
```

## Trade Offs

| Decision | Benefit | Cost |
|---|---|---|
| Separate Express API vs Next.js API routes | Cleaner separation, easier to test AI logic | Extra process to run, CORS config needed |
| Cosmos DB vs SQLite | Production ready, flexible schema, free tier | Requires Azure account, more setup than a local file |
| Pre generate sips in batches | Smooth scroll experience, no loading spinners | Uses more OpenAI tokens upfront, some sips may never be viewed |
| Single user (mocked auth) | Faster to build, no auth flow to debug | Cannot demo multi user scenarios |
| CSS scroll snap vs virtual scroll library | Zero dependencies, native browser support | Less control over snap physics, no recycling of off screen DOM |

## Security Notes (Hackathon Scope)

- API keys stored in `.env` files, never committed (`.gitignore` includes `.env`)
- No user authentication; single hardcoded user ID
- CORS restricted to `localhost:3000` in development
- No rate limiting on API (acceptable for demo)
