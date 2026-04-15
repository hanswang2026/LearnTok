import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { generateSip } from "../services/ai";
import {
  getSession,
  updateSession,
  updateSipReaction,
  getSipsBySession,
  createSips,
} from "../services/cosmos";

const router = Router();

// POST /api/sips/:id/interact — Record a user interaction
router.post("/:id/interact", async (req: Request, res: Response) => {
  try {
    const sipId = req.params.id as string;
    const { reaction, sessionId } = req.body as {
      reaction: "liked" | "skipped" | "bookmarked";
      sessionId: string;
    };

    if (!reaction || !sessionId) {
      res.status(400).json({ error: "reaction and sessionId are required" });
      return;
    }

    // 1. Record the reaction
    await updateSipReaction(sipId, sessionId, reaction);

    let queueUpdated = false;
    let newSipsAdded = 0;

    // 2. If liked, generate deeper sips
    if (reaction === "liked") {
      const session = await getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      // Find the sip to get its skeletonNodeId
      const sips = await getSipsBySession(sessionId);
      const currentSip = sips.find((s) => s.id === sipId);

      if (currentSip && session.skeleton) {
        const currentNode = session.skeleton.find(
          (n) => n.id === currentSip.skeletonNodeId
        );

        if (currentNode) {
          // Find child nodes (depth+1, same parentId) or next unused nodes
          const usedNodeIds = new Set(sips.map((s) => s.skeletonNodeId));

          let candidateNodes = session.skeleton.filter(
            (n) =>
              n.parentId === currentNode.id &&
              n.depth === currentNode.depth + 1 &&
              !usedNodeIds.has(n.id)
          );

          // Fallback: pick next unused nodes at any deeper depth
          if (candidateNodes.length === 0) {
            candidateNodes = session.skeleton.filter(
              (n) => n.depth > currentNode.depth && !usedNodeIds.has(n.id)
            );
          }

          const nodesToExpand = candidateNodes.slice(0, 3);

          if (nodesToExpand.length > 0) {
            const maxOrder = sips.reduce(
              (max, s) => Math.max(max, s.order),
              0
            );

            const newSipPromises = nodesToExpand.map((node, index) =>
              generateSip(node, session.skeleton).then((generated) => ({
                id: uuidv4(),
                sessionId,
                skeletonNodeId: node.id,
                order: maxOrder + index + 1,
                title: generated.title,
                content: generated.content,
                interactionType: generated.interactionType,
                interaction: generated.interaction,
                visualHint: generated.visualHint,
                depth: node.depth,
                userReaction: null as
                  | "liked"
                  | "skipped"
                  | "bookmarked"
                  | null,
                createdAt: new Date().toISOString(),
              }))
            );

            const newSips = await Promise.all(newSipPromises);
            await createSips(newSips);

            // Insert new node IDs into the sipQueue after the current position
            const newNodeIds = nodesToExpand.map((n) => n.id);
            const insertAt = session.currentIndex + 1;
            const updatedQueue = [...session.sipQueue];
            updatedQueue.splice(insertAt, 0, ...newNodeIds);

            await updateSession(sessionId, { sipQueue: updatedQueue });
            queueUpdated = true;
            newSipsAdded = newSips.length;
          }
        }
      }
    }

    // 3. Advance currentIndex
    const session = await getSession(sessionId);
    if (session) {
      await updateSession(sessionId, {
        currentIndex: session.currentIndex + 1,
      });
    }

    res.json({ ok: true, queueUpdated, newSipsAdded });
  } catch (error) {
    console.error("Error recording interaction:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;
