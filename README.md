# LearnTok

*Scroll to Learn. One Sip at a Time.*

LearnTok is a TikTok style learning experience for Microsoft Learn content. Enter any topic or paste a Learn URL, and AI generates a personalized infinite scroll feed of sip sized learning cards (30 to 60 second reads) that adapt to your curiosity in real time.

## Architecture

```
┌──────────────────────────────────────────────┐
│                  Browser                      │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │         Next.js Frontend             │    │
│  │    (TikTok style snap scroll feed)   │    │
│  └──────────────────┬───────────────────┘    │
└─────────────────────┼────────────────────────┘
                      │ REST
┌─────────────────────▼────────────────────────┐
│              Express API                      │
│                                              │
│  Sessions ─── Sips ─── AI Pipeline           │
│                                              │
└────┬──────────────┬──────────────┬───────────┘
     │              │              │
┌────▼─────┐  ┌────▼─────┐  ┌────▼──────────┐
│ Cosmos DB│  │ Azure AI │  │ Azure OpenAI  │
│          │  │ Search   │  │ (GPT-4o)      │
│ Sessions │  │          │  │               │
│ Sips     │  │ MS Learn │  │ Skeleton gen  │
│ Users    │  │ Index    │  │ Sip gen       │
└──────────┘  └──────────┘  └───────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14+, React, TypeScript |
| Backend | Express, TypeScript |
| AI | Azure OpenAI (GPT-4o) |
| Search | Azure AI Search |
| Database | Azure Cosmos DB (NoSQL) |
| Monorepo | pnpm workspaces |

## Project Structure

```
LearnTok/
├── apps/
│   ├── web/                 # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/         # App Router pages
│   │   │   ├── components/  # React components
│   │   │   └── lib/         # Client utilities
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── api/                 # Express backend
│       ├── src/
│       │   ├── routes/      # API route handlers
│       │   ├── services/    # AI pipeline, Cosmos DB
│       │   ├── models/      # TypeScript interfaces
│       │   └── index.ts     # Express app entry
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── shared/              # Shared TypeScript types
│       ├── src/
│       │   └── types.ts
│       ├── package.json
│       └── tsconfig.json
├── docs/
│   ├── plan.md              # Implementation plan
│   └── tech_design.md       # Technical design
├── PITCH.md                 # Project pitch
├── package.json             # Root workspace config
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
└── README.md
```

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [pnpm](https://pnpm.io/) 8 or later (`npm install -g pnpm`)
- An Azure subscription with:
  - Azure OpenAI resource (GPT-4o deployment)
  - Azure Cosmos DB account (NoSQL API)
  - Azure AI Search resource (optional, stretch goal)

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd LearnTok
pnpm install
```

### 2. Configure environment

Copy the example env file and fill in your Azure credentials:

```bash
cp .env.example .env
```

Required variables:

```
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_DEPLOYMENT=gpt-4o
COSMOS_ENDPOINT=https://your-account.documents.azure.com:443/
COSMOS_KEY=your-key
COSMOS_DATABASE=learntok
```

### 3. Start development

```bash
pnpm dev
```

This starts both the frontend (http://localhost:3000) and the API (http://localhost:3001) concurrently.

### 4. Try it out

1. Open http://localhost:3000
2. Enter a topic like "Azure Functions" or paste a Microsoft Learn URL
3. Scroll through your personalized learning sips
4. Heart what interests you, skip what doesn't

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | /api/sessions | Create a session from a topic or URL |
| GET | /api/sessions/:id | Get session state (for resume) |
| GET | /api/sessions/:id/sips | Get next batch of sips |
| POST | /api/sips/:id/interact | Record like, skip, or bookmark |

## Documentation

- [Project Pitch](./PITCH.md)
- [Implementation Plan](./docs/plan.md)
- [Technical Design](./docs/tech_design.md)

## License

MIT
