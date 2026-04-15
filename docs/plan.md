# LearnTok: Implementation Plan

## Overview

This document maps out the implementation plan for LearnTok, scoped to a single afternoon hackathon session. The plan is organized into four one hour milestones, each with clear deliverables and task dependencies.

## Milestones

### Milestone 1: Scaffold and Core AI

**Goal:** Working monorepo with AI pipelines that can turn a topic into learning sips.

| Task | Description | Depends On | Done When |
|---|---|---|---|
| project-setup | Initialize pnpm monorepo with apps/web (Next.js) and apps/api (Express), both TypeScript | None | `pnpm dev` starts both apps |
| ai-skeleton | Azure OpenAI prompt that takes a topic string or MS Learn URL and returns a structured learning skeleton (JSON array of subtopics with order and depth) | project-setup | Calling the function with "Azure Functions" returns a valid skeleton |
| ai-cards | Azure OpenAI prompt that takes a skeleton node and generates a learning sip (title, content, interaction type, 100 to 200 words) | ai-skeleton | Calling the function with a skeleton node returns a well formed sip |

### Milestone 2: API and Data

**Goal:** REST API backed by Cosmos DB that can create sessions, serve sips, and record interactions.

| Task | Description | Depends On | Done When |
|---|---|---|---|
| cosmos-setup | Cosmos DB client module, create database and containers (sessions, sips, users) | project-setup | Can read/write a test document |
| feed-api | Express routes: `POST /api/sessions` (create session from topic), `GET /api/sessions/:id/sips` (get next N sips), `POST /api/sips/:id/interact` (record like/skip/bookmark) | cosmos-setup, ai-cards | curl tests return expected JSON |

### Milestone 3: Frontend Feed

**Goal:** A scrollable TikTok style feed that displays sips and sends interactions back to the API.

| Task | Description | Depends On | Done When |
|---|---|---|---|
| feed-ui | Full screen vertical snap scroll component using CSS scroll snap. Each card fills the viewport. Swipe or scroll to advance. | feed-api | Scrolling through cards works smoothly |
| card-rendering | Render sip content (title, body, interaction area). Wire like/skip/bookmark buttons to `POST /api/sips/:id/interact`. | feed-ui | Clicking like on a card sends the interaction and shows visual feedback |

### Milestone 4: Polish and Demo

**Goal:** Adaptive behavior, resume support, and a demo ready state.

| Task | Description | Depends On | Done When |
|---|---|---|---|
| adaptive-queue | When a sip is liked, generate 2 to 3 deeper sips on that subtopic and insert them next in the queue. When skipped, compress remaining sips on that subtopic. | feed-api | Liking a card about "triggers" adds deeper trigger content next |
| resume | Persist `currentIndex` to Cosmos DB on every interaction. On session load, scroll to the saved position. | feed-ui | Refreshing the page resumes at the last viewed sip |
| demo-prep | Seed Cosmos DB with a pre generated session on "Azure Functions" (15 to 20 sips). Write a 2 minute demo walkthrough script. | adaptive-queue, resume | Can run the full demo flow end to end |

## Stretch Goals

These are not required for the demo but would strengthen the project if time permits.

| Goal | Description |
|---|---|
| Azure AI Search grounding | Index MS Learn docs in Azure AI Search and use as RAG context for sip generation |
| Multiple card types | Quiz cards, code snippet cards, flashcard flip cards with distinct UI treatments |
| Streak tracking | Daily streak counter, "Today I Learned" summary card at end of session |
| Depth slider | Let user toggle between casual (high level) and deep dive (detailed) modes |

## Task Dependency Graph

```
project-setup
  ├── ai-skeleton
  │     └── ai-cards
  │           └── feed-api ──┐
  └── cosmos-setup ──────────┘
                               └── feed-ui
                                     ├── card-rendering
                                     ├── resume
                                     └── adaptive-queue
                                           └── demo-prep
```

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Azure OpenAI rate limits | Pre generate sips in batches of 5 to 10, cache in Cosmos DB |
| Cosmos DB setup time | Use the emulator locally or a free tier account pre provisioned |
| Scroll performance | Keep DOM minimal: render only 3 cards at a time (previous, current, next) |
| AI hallucination | Prompt engineering: instruct the model to only cover what it knows, mark uncertainty |
