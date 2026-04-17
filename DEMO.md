# LearnTok: Demo Script

*~2 minutes · Scroll to Learn. One Sip at a Time.*

---

Learning is fragmented now. We all know the feeling. You have five minutes between meetings, you're on the bus, you're waiting for a build. You want to learn something new about Azure, but Microsoft Learn expects you to sit down for an hour and read through a full module. Nobody has that kind of time anymore.

That's why I built LearnTok. It reimagines Microsoft Learn as a TikTok style feed. You enter a topic, like "Azure Functions," or paste a Learn URL, and the AI takes over. It analyzes the subject, maps out a learning path, and generates a stream of what we call "sips," bite sized learning cards, each one a 30 to 60 second read. You scroll through them like a social feed.

Here's where it gets interesting. The feed is adaptive. When you like a sip, the AI digs deeper into that subtopic and generates more content on that thread. Skip something? It moves on. You're always in control, and you never have to commit more than a minute at a time.

Under the hood, we built a full stack app in one afternoon. The frontend is Next.js with a snap scroll feed that feels native. The backend is Express with TypeScript, connected to Azure OpenAI for content generation and Cosmos DB for persistence. There's a smart buffer system that pre generates sips in the background so scrolling always feels instant. Every interaction is non blocking. You like a card, the UI scrolls immediately, and the AI quietly generates deeper content behind the scenes.

We also built it as a proper monorepo with pnpm workspaces, shared TypeScript types, full API contracts, and comprehensive logging so you can see exactly what the AI is generating in real time.

The result is a working prototype where you can enter any topic, scroll through AI generated learning sips, react to shape your feed, and pick up right where you left off. It makes learning feel effortless, like scrolling your favorite app, except you're getting smarter.
