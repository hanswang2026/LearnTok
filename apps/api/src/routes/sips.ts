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
import { ensureSipBuffer } from "../services/buffer";

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

    // 1. Get the current sip to check previous reaction
    const existingSips = await getSipsBySession(sessionId, undefined, 100);
    const existingSip = existingSips.find((s) => s.id === sipId);
    const wasAlreadyLiked = existingSip?.userReaction === "liked";

    console.log(`[INTERACT] sipId=${sipId} reaction=${reaction} wasAlreadyLiked=${wasAlreadyLiked} existingSip=${!!existingSip}`);

    // 2. Record the reaction
    await updateSipReaction(sipId, sessionId, reaction);

    let queueUpdated = false;
    let newSipsAdded = 0;

    // 3. If liked AND not previously liked, generate deeper sips
    if (reaction === "liked" && !wasAlreadyLiked) {
      console.log(`[INTERACT] Expanding sip ${sipId}...`);
      const session = await getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      // Find the sip to get its skeletonNodeId
      const sips = await getSipsBySession(sessionId, undefined, 100);
      const currentSip = sips.find((s) => s.id === sipId);

      if (currentSip && session.skeleton) {
        const currentNode = session.skeleton.find(
          (n) => n.id === currentSip.skeletonNodeId
        );

        if (currentNode) {
          // Find child nodes (depth+1, same parentId) or next unused nodes
          const usedNodeIds = new Set(sips.map((s) => s.skeletonNodeId));
          console.log(`[INTERACT] currentNode: ${currentNode.id} depth=${currentNode.depth} | used=${usedNodeIds.size}/${session.skeleton.length} skeleton nodes`);

          let candidateNodes = session.skeleton.filter(
            (n) =>
              n.parentId === currentNode.id &&
              n.depth === currentNode.depth + 1 &&
              !usedNodeIds.has(n.id)
          );
          console.log(`[INTERACT] Child candidates: ${candidateNodes.length}`);

          // Fallback 1: pick next unused nodes at any deeper depth
          if (candidateNodes.length === 0) {
            candidateNodes = session.skeleton.filter(
              (n) => n.depth > currentNode.depth && !usedNodeIds.has(n.id)
            );
            console.log(`[INTERACT] Deeper depth candidates: ${candidateNodes.length}`);
          }

          // Fallback 2: pick any next unused skeleton nodes (in order)
          if (candidateNodes.length === 0) {
            candidateNodes = session.skeleton.filter(
              (n) => !usedNodeIds.has(n.id)
            );
            console.log(`[INTERACT] Any unused candidates: ${candidateNodes.length}`);
          }

          const nodesToExpand = candidateNodes.slice(0, 5);

          if (nodesToExpand.length > 0) {
            const maxOrder = sips.reduce(
              (max, s) => Math.max(max, s.order),
              0
            );

            // Check which candidate nodes already have sips in DB (from background generation)
            const existingSipNodeIds = new Set(sips.map((s) => s.skeletonNodeId));
            const alreadyGenerated = nodesToExpand.filter((n) => existingSipNodeIds.has(n.id));
            const needGeneration = nodesToExpand.filter((n) => !existingSipNodeIds.has(n.id));

            console.log(`[INTERACT] ${alreadyGenerated.length} already in DB, ${needGeneration.length} need AI generation`);

            // Generate only the ones that don't exist yet
            const generatedSips = needGeneration.length > 0
              ? await Promise.all(
                  needGeneration.map((node, index) =>
                    generateSip(node, session.skeleton).then((generated) => ({
                      id: uuidv4(),
                      sessionId,
                      skeletonNodeId: node.id,
                      order: maxOrder + alreadyGenerated.length + index + 1,
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
                  )
                )
              : [];

            if (generatedSips.length > 0) {
              await createSips(generatedSips);
            }

            const newSipsAdded_count = generatedSips.length;

            // Insert new node IDs into the sipQueue after the current position
            const newNodeIds = needGeneration.map((n) => n.id);
            if (newNodeIds.length > 0) {
              const insertAt = session.currentIndex + 1;
              const updatedQueue = [...session.sipQueue];
              updatedQueue.splice(insertAt, 0, ...newNodeIds);
              await updateSession(sessionId, { sipQueue: updatedQueue });
            }
            queueUpdated = true;
            newSipsAdded = newSipsAdded_count + alreadyGenerated.length;
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

    console.log(`[INTERACT] Done. queueUpdated=${queueUpdated} newSipsAdded=${newSipsAdded}`);
    res.json({ ok: true, queueUpdated, newSipsAdded });

    // Background: ensure buffer stays full after any interaction
    ensureSipBuffer(sessionId);
  } catch (error) {
    console.error("Error recording interaction:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;
