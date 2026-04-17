import { v4 as uuidv4 } from "uuid";
import { generateSip, SkeletonNode } from "./ai";
import { getSession, getSipsBySession, createSips } from "./cosmos";

const BUFFER_TARGET = 10;

// Track in-flight buffer jobs to avoid duplicate generation
const bufferInProgress = new Set<string>();

/**
 * Ensures at least BUFFER_TARGET unloaded sips exist in Cosmos DB
 * for the given session. "Unloaded" means sips with userReaction === null.
 * If not enough, generates new sips from unused skeleton nodes.
 *
 * This runs in the background (fire and forget) — does not block the caller.
 */
export function ensureSipBuffer(sessionId: string): void {
  if (bufferInProgress.has(sessionId)) {
    console.log(`[BUFFER] Already buffering for session ${sessionId}, skipping`);
    return;
  }

  bufferInProgress.add(sessionId);

  _fillBuffer(sessionId)
    .catch((err) => console.error(`[BUFFER] Error filling buffer for ${sessionId}:`, err))
    .finally(() => bufferInProgress.delete(sessionId));
}

async function _fillBuffer(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) {
    console.log(`[BUFFER] Session ${sessionId} not found`);
    return;
  }

  const allSips = await getSipsBySession(sessionId, undefined, 500);
  const unreactedCount = allSips.filter((s) => s.userReaction === null).length;
  const deficit = BUFFER_TARGET - unreactedCount;

  console.log(`[BUFFER] Session ${sessionId}: ${allSips.length} total sips, ${unreactedCount} unreacted, deficit=${deficit}`);

  if (deficit <= 0) {
    console.log(`[BUFFER] Buffer is full, no generation needed`);
    return;
  }

  // Find skeleton nodes that don't have sips yet
  const usedNodeIds = new Set(allSips.map((s) => s.skeletonNodeId));
  const unusedNodes = session.skeleton.filter((n) => !usedNodeIds.has(n.id));

  if (unusedNodes.length === 0) {
    console.log(`[BUFFER] All ${session.skeleton.length} skeleton nodes are used, no more to generate`);
    return;
  }

  const nodesToGenerate = unusedNodes.slice(0, deficit);
  const maxOrder = allSips.reduce((max, s) => Math.max(max, s.order), 0);

  console.log(`[BUFFER] Generating ${nodesToGenerate.length} sips from unused skeleton nodes...`);

  const newSips = await Promise.all(
    nodesToGenerate.map((node, index) =>
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
        userReaction: null as "liked" | "skipped" | "bookmarked" | null,
        createdAt: new Date().toISOString(),
      }))
    )
  );

  await createSips(newSips);
  console.log(`[BUFFER] Generated and saved ${newSips.length} buffer sips`);
}
