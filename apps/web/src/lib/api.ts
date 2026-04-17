import type { Session, Sip } from "./types";

const API_BASE = "http://localhost:3001";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function createSession(
  topic: string,
  sourceUrl?: string
): Promise<Session> {
  return request<Session>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ topic, sourceUrl: sourceUrl || undefined }),
  });
}

export async function getSession(id: string): Promise<Session> {
  return request<Session>(`/api/sessions/${id}`);
}

export async function getSips(
  sessionId: string,
  after?: number,
  limit = 10
): Promise<{ sips: Sip[]; hasMore: boolean; currentIndex: number }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (after !== undefined) params.set("after", String(after));
  return request<{ sips: Sip[]; hasMore: boolean; currentIndex: number }>(
    `/api/sessions/${sessionId}/sips?${params}`
  );
}

export async function interactWithSip(
  sipId: string,
  sessionId: string,
  reaction: string
): Promise<{ ok: boolean; queueUpdated: boolean; newSipsAdded: number }> {
  return request<{ ok: boolean; queueUpdated: boolean; newSipsAdded: number }>(`/api/sips/${sipId}/interact`, {
    method: "POST",
    body: JSON.stringify({ reaction, sessionId }),
  });
}
