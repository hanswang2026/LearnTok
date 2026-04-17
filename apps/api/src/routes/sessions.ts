import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { generateSkeleton, generateSip, SkeletonNode } from "../services/ai";
import {
  createSession,
  getSession,
  getSipsBySession,
  createSips,
} from "../services/cosmos";
import { ensureSipBuffer } from "../services/buffer";

const router = Router();

// POST /api/sessions — Create a new learning session
router.post("/", async (req: Request, res: Response) => {
  try {
    const { topic, sourceUrl } = req.body as {
      topic?: string;
      sourceUrl?: string;
    };

    if (!topic && !sourceUrl) {
      res.status(400).json({ error: "topic or sourceUrl is required" });
      return;
    }

    const effectiveTopic = topic || sourceUrl || "";

    // 1. Generate the learning skeleton
    const skeleton = await generateSkeleton(effectiveTopic, sourceUrl);

    // 2. Generate sips for the first 5 skeleton nodes
    const firstNodes = skeleton.slice(0, 5);
    const sessionId = uuidv4();

    const sipPromises = firstNodes.map((node, index) =>
      generateSip(node, skeleton).then((generated) => ({
        id: uuidv4(),
        sessionId,
        skeletonNodeId: node.id,
        order: index + 1,
        title: generated.title,
        content: generated.content,
        interactionType: generated.interactionType,
        interaction: generated.interaction,
        visualHint: generated.visualHint,
        depth: node.depth,
        userReaction: null as "liked" | "skipped" | "bookmarked" | null,
        createdAt: new Date().toISOString(),
      }))
    );

    const sips = await Promise.all(sipPromises);

    // 3. Create the session object
    const session = {
      id: sessionId,
      userId: "hackathon-user",
      topic: effectiveTopic,
      sourceUrl,
      skeleton,
      sipQueue: skeleton.map((n) => n.id),
      currentIndex: 0,
      status: "active" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 4. Persist to Cosmos DB
    await createSession(session);
    await createSips(sips);

    // 5. Send response immediately with first 5 sips
    res.status(201).json({
      id: session.id,
      topic: session.topic,
      skeleton,
      sips,
    });

    // 6. Background: fill buffer to 10 unreacted sips
    ensureSipBuffer(sessionId);
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

// GET /api/sessions/:id — Get session state
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const session = await getSession(id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(session);
  } catch (error) {
    console.error("Error getting session:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

// GET /api/sessions/:id/sips — Get next batch of sips
router.get("/:id/sips", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const after = req.query.after ? Number(req.query.after) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 5;

    const sips = await getSipsBySession(id, after, limit);
    const session = await getSession(id);

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.json({
      sips,
      hasMore: sips.length === limit,
      currentIndex: session.currentIndex,
    });

    // Background: ensure buffer stays full after serving sips
    ensureSipBuffer(id);
  } catch (error) {
    console.error("Error getting sips:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;
