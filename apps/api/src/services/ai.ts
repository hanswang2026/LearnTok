// @azure/openai v2.0.0 is a types-only companion; AzureOpenAI lives in the "openai" package
import { AzureOpenAI } from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";

// Logging helpers
const LOG_PREFIX = "[AI]";

function logRequest(label: string, params: ChatCompletionCreateParamsNonStreaming) {
  console.log(`\n${LOG_PREFIX} ──── ${label} REQUEST ────`);
  console.log(`${LOG_PREFIX} Model: ${params.model}`);
  console.log(`${LOG_PREFIX} Response format: ${JSON.stringify(params.response_format)}`);
  for (const msg of params.messages) {
    const content = typeof msg.content === "string"
      ? msg.content.length > 500 ? msg.content.slice(0, 500) + "... (truncated)" : msg.content
      : JSON.stringify(msg.content);
    console.log(`${LOG_PREFIX} [${msg.role}] ${content}`);
  }
  console.log(`${LOG_PREFIX} ──── Sending request... ────\n`);
}

function logResponse(label: string, response: any, startTime: number) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n${LOG_PREFIX} ──── ${label} RESPONSE (${elapsed}s) ────`);
  console.log(`${LOG_PREFIX} ID: ${response.id}`);
  console.log(`${LOG_PREFIX} Model: ${response.model}`);
  console.log(`${LOG_PREFIX} Usage: prompt=${response.usage?.prompt_tokens} completion=${response.usage?.completion_tokens} total=${response.usage?.total_tokens}`);
  console.log(`${LOG_PREFIX} Finish reason: ${response.choices?.[0]?.finish_reason}`);
  const content = response.choices?.[0]?.message?.content ?? "(empty)";
  console.log(`${LOG_PREFIX} Content:\n${content}`);
  console.log(`${LOG_PREFIX} ──── End ${label} ────\n`);
}

// Re-export shared types locally to avoid workspace-link issues
export interface SkeletonNode {
  id: string;
  title: string;
  parentId: string | null;
  depth: number;
  order: number;
  description: string;
}

export interface GeneratedSip {
  title: string;
  content: string;
  interactionType: "quiz" | "flashcard" | "summary" | "code-snippet";
  interaction: { question?: string; options?: string[]; answer?: string; hint?: string };
  visualHint: string;
}

function getClient(): AzureOpenAI {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!endpoint) {
    throw new Error("Missing AZURE_OPENAI_ENDPOINT environment variable.");
  }

  const credential = new DefaultAzureCredential();
  const azureADTokenProvider = getBearerTokenProvider(
    credential,
    "https://cognitiveservices.azure.com/.default"
  );
  return new AzureOpenAI({ endpoint, azureADTokenProvider, apiVersion: "2024-10-21" });
}

function getDeployment(): string {
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (!deployment) {
    throw new Error("Missing AZURE_OPENAI_DEPLOYMENT environment variable.");
  }
  return deployment;
}

const SKELETON_SYSTEM_PROMPT = `You are a curriculum designer for technical education. Given a technical topic, create a learning skeleton as a JSON array. Each node should have: id (string like "node-1"), title (string), parentId (string or null for root nodes), depth (number 0 to 2), order (number starting at 1), and description (one sentence string). Aim for 10 to 20 nodes. Start with fundamentals, then move to intermediate concepts. Cover the topic comprehensively but keep each node focused on a single concept.`;

const SIP_SYSTEM_PROMPT = `You are a technical educator who creates engaging, bite-sized learning content. Given a skeleton node and its surrounding context, generate a learning sip. The sip must be: self-contained (no prior reading required), 100 to 200 words, conversational in tone, and include one interaction element (quiz, flashcard, or key takeaway). Output as JSON with fields: title (string), content (string), interactionType ("quiz" | "flashcard" | "summary" | "code-snippet"), interaction (object with question, options, answer for quiz; or hint for others), visualHint (string like "icon:lightning").`;

export async function generateSkeleton(
  topic: string,
  sourceUrl?: string
): Promise<SkeletonNode[]> {
  const client = getClient();
  const deployment = getDeployment();

  let userMessage = `Create a learning skeleton for the topic: "${topic}".`;
  if (sourceUrl) {
    userMessage += ` Use this source for additional context: ${sourceUrl}`;
  }
  userMessage += ` Return only a JSON object with a "nodes" key containing the array.`;

  const params: ChatCompletionCreateParamsNonStreaming = {
    model: deployment,
    messages: [
      { role: "system", content: SKELETON_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
  };

  logRequest("SKELETON", params);
  const startTime = Date.now();
  const response = await client.chat.completions.create(params);
  logResponse("SKELETON", response, startTime);

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("Azure OpenAI returned an empty response for skeleton generation.");
  }

  try {
    const parsed = JSON.parse(raw);
    const nodes: SkeletonNode[] = Array.isArray(parsed) ? parsed : parsed.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error("Parsed skeleton is not a non-empty array.");
    }
    return nodes;
  } catch (err) {
    throw new Error(
      `Failed to parse skeleton response: ${err instanceof Error ? err.message : String(err)}\nRaw: ${raw}`
    );
  }
}

export async function generateSip(
  node: SkeletonNode,
  skeleton: SkeletonNode[]
): Promise<GeneratedSip> {
  const client = getClient();
  const deployment = getDeployment();

  const contextSummary = skeleton
    .map((n) => `${n.id}: ${n.title} (depth ${n.depth})`)
    .join("\n");

  const userMessage = `Generate a learning sip for this skeleton node:
${JSON.stringify(node, null, 2)}

Full skeleton context:
${contextSummary}

Return only a JSON object with keys: title, content, interactionType, interaction, visualHint.`;

  const params: ChatCompletionCreateParamsNonStreaming = {
    model: deployment,
    messages: [
      { role: "system", content: SIP_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
  };

  logRequest(`SIP [${node.id}: ${node.title}]`, params);
  const startTime = Date.now();
  const response = await client.chat.completions.create(params);
  logResponse(`SIP [${node.id}: ${node.title}]`, response, startTime);

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("Azure OpenAI returned an empty response for sip generation.");
  }

  try {
    const sip: GeneratedSip = JSON.parse(raw);
    if (!sip.title || !sip.content || !sip.interactionType) {
      throw new Error("Parsed sip is missing required fields (title, content, interactionType).");
    }
    return sip;
  } catch (err) {
    throw new Error(
      `Failed to parse sip response: ${err instanceof Error ? err.message : String(err)}\nRaw: ${raw}`
    );
  }
}
