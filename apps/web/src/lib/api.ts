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
): Promise<Sip[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (after !== undefined) params.set("after", String(after));
  return request<Sip[]>(`/api/sessions/${sessionId}/sips?${params}`);
}

export async function interactWithSip(
  sipId: string,
  sessionId: string,
  reaction: string
): Promise<void> {
  await request(`/api/sips/${sipId}/interact`, {
    method: "POST",
    body: JSON.stringify({ reaction, sessionId }),
  });
}
