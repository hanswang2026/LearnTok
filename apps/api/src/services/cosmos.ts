import { CosmosClient, Container, Database, SqlParameter } from "@azure/cosmos";
import https from "node:https";

// Disable TLS verification for Cosmos DB Emulator (self-signed cert)
const emulatorAgent = new https.Agent({ rejectUnauthorized: false });

// Re-define types locally to avoid workspace linking issues
interface SkeletonNode {
  id: string;
  title: string;
  parentId: string | null;
  depth: number;
  order: number;
  description: string;
}

interface SipInteraction {
  question?: string;
  options?: string[];
  answer?: string;
  hint?: string;
}

interface Session {
  id: string;
  userId: string;
  topic: string;
  sourceUrl?: string;
  skeleton: SkeletonNode[];
  sipQueue: string[];
  currentIndex: number;
  status: "active" | "paused" | "completed";
  createdAt: string;
  updatedAt: string;
}

interface Sip {
  id: string;
  sessionId: string;
  skeletonNodeId: string;
  order: number;
  title: string;
  content: string;
  interactionType: "quiz" | "flashcard" | "summary" | "code-snippet";
  interaction: SipInteraction;
  visualHint: string;
  depth: number;
  userReaction: "liked" | "skipped" | "bookmarked" | null;
  createdAt: string;
}

interface User {
  id: string;
  displayName: string;
  activeSessions: string[];
  totalSipsViewed: number;
  streak: number;
  bookmarks: string[];
  createdAt: string;
}

// --- Cosmos client setup (lazy — env vars read at call time, after dotenv loads) ---

let _client: CosmosClient | null = null;

function getClient(): CosmosClient {
  if (!_client) {
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    if (!endpoint || !key) {
      throw new Error(
        "COSMOS_ENDPOINT or COSMOS_KEY not set. Check your .env file."
      );
    }
    const isEmulator = endpoint.includes("localhost") || endpoint.includes("127.0.0.1");
    _client = new CosmosClient({
      endpoint,
      key,
      ...(isEmulator && { agent: emulatorAgent }),
    });
  }
  return _client;
}

function getDatabaseId(): string {
  return process.env.COSMOS_DATABASE || "learntok";
}

let database: Database;
let sessionsContainer: Container;
let sipsContainer: Container;
let usersContainer: Container;

// --- Initialisation ---

export async function initDatabase(): Promise<void> {
  try {
    const client = getClient();
    const databaseId = getDatabaseId();

    const { database: db } = await client.databases.createIfNotExists({
      id: databaseId,
    });
    database = db;

    const { container: sessions } = await database.containers.createIfNotExists(
      { id: "sessions", partitionKey: { paths: ["/id"] } }
    );
    sessionsContainer = sessions;

    const { container: sips } = await database.containers.createIfNotExists({
      id: "sips",
      partitionKey: { paths: ["/sessionId"] },
    });
    sipsContainer = sips;

    const { container: users } = await database.containers.createIfNotExists({
      id: "users",
      partitionKey: { paths: ["/id"] },
    });
    usersContainer = users;

    console.log(`Cosmos DB initialised – database: ${databaseId}`);
  } catch (error) {
    throw new Error(
      `Failed to initialise Cosmos DB: ${error instanceof Error ? error.message : error}`
    );
  }
}

// --- Sessions ---

export async function createSession(session: Session): Promise<Session> {
  try {
    const { resource } = await sessionsContainer.items.create(session);
    return resource as Session;
  } catch (error) {
    throw new Error(
      `Failed to create session ${session.id}: ${error instanceof Error ? error.message : error}`
    );
  }
}

export async function getSession(id: string): Promise<Session | null> {
  try {
    const { resource } = await sessionsContainer.item(id, id).read<Session>();
    return resource ?? null;
  } catch (error: any) {
    if (error.code === 404) return null;
    throw new Error(
      `Failed to get session ${id}: ${error instanceof Error ? error.message : error}`
    );
  }
}

export async function updateSession(
  id: string,
  updates: Partial<Session>
): Promise<Session> {
  try {
    const existing = await getSession(id);
    if (!existing) throw new Error(`Session ${id} not found`);

    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    const { resource } = await sessionsContainer.item(id, id).replace(merged);
    return resource as Session;
  } catch (error) {
    throw new Error(
      `Failed to update session ${id}: ${error instanceof Error ? error.message : error}`
    );
  }
}

// --- Sips ---

export async function createSip(sip: Sip): Promise<Sip> {
  try {
    const { resource } = await sipsContainer.items.create(sip);
    return resource as Sip;
  } catch (error) {
    throw new Error(
      `Failed to create sip ${sip.id}: ${error instanceof Error ? error.message : error}`
    );
  }
}

export async function createSips(sips: Sip[]): Promise<Sip[]> {
  const created: Sip[] = [];
  for (const sip of sips) {
    created.push(await createSip(sip));
  }
  return created;
}

export async function getSipsBySession(
  sessionId: string,
  afterOrder?: number,
  limit: number = 5
): Promise<Sip[]> {
  try {
    const conditions = ["c.sessionId = @sessionId"];
    const parameters: SqlParameter[] = [
      { name: "@sessionId", value: sessionId },
    ];

    if (afterOrder !== undefined) {
      conditions.push("c.order > @afterOrder");
      parameters.push({ name: "@afterOrder", value: afterOrder });
    }

    const query = {
      query: `SELECT * FROM c WHERE ${conditions.join(" AND ")} ORDER BY c["order"] ASC OFFSET 0 LIMIT @limit`,
      parameters: [...parameters, { name: "@limit", value: limit }],
    };

    const { resources } = await sipsContainer.items
      .query<Sip>(query, { partitionKey: sessionId })
      .fetchAll();

    return resources;
  } catch (error) {
    throw new Error(
      `Failed to get sips for session ${sessionId}: ${error instanceof Error ? error.message : error}`
    );
  }
}

export async function updateSipReaction(
  sipId: string,
  sessionId: string,
  reaction: string
): Promise<void> {
  try {
    const { resource } = await sipsContainer
      .item(sipId, sessionId)
      .read<Sip>();

    if (!resource) throw new Error(`Sip ${sipId} not found`);

    const updated = { ...resource, userReaction: reaction };
    await sipsContainer.item(sipId, sessionId).replace(updated);
  } catch (error) {
    throw new Error(
      `Failed to update reaction for sip ${sipId}: ${error instanceof Error ? error.message : error}`
    );
  }
}

// --- Users ---

export async function getOrCreateUser(userId: string): Promise<User> {
  try {
    const { resource } = await usersContainer.item(userId, userId).read<User>();
    if (resource) return resource;
  } catch (error: any) {
    if (error.code !== 404) {
      throw new Error(
        `Failed to get user ${userId}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  // User doesn't exist – create a default one
  const newUser: User = {
    id: userId,
    displayName: userId,
    activeSessions: [],
    totalSipsViewed: 0,
    streak: 0,
    bookmarks: [],
    createdAt: new Date().toISOString(),
  };

  try {
    const { resource } = await usersContainer.items.create(newUser);
    return resource as User;
  } catch (error) {
    throw new Error(
      `Failed to create user ${userId}: ${error instanceof Error ? error.message : error}`
    );
  }
}

export async function updateUser(
  userId: string,
  updates: Partial<User>
): Promise<User> {
  try {
    const existing = await getOrCreateUser(userId);
    const merged = { ...existing, ...updates };
    const { resource } = await usersContainer
      .item(userId, userId)
      .replace(merged);
    return resource as User;
  } catch (error) {
    throw new Error(
      `Failed to update user ${userId}: ${error instanceof Error ? error.message : error}`
    );
  }
}
