// LearnTok shared types

export interface SkeletonNode {
  id: string;
  title: string;
  parentId: string | null;
  depth: number;
  order: number;
  description: string;
}

export interface SipInteraction {
  question?: string;
  options?: string[];
  answer?: string;
  hint?: string;
}

export type InteractionType = "quiz" | "flashcard" | "summary" | "code-snippet";
export type UserReaction = "liked" | "skipped" | "bookmarked" | null;
export type SessionStatus = "active" | "paused" | "completed";

export interface Sip {
  id: string;
  sessionId: string;
  skeletonNodeId: string;
  order: number;
  title: string;
  content: string;
  interactionType: InteractionType;
  interaction: SipInteraction;
  visualHint: string;
  depth: number;
  userReaction: UserReaction;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  topic: string;
  sourceUrl?: string;
  skeleton: SkeletonNode[];
  sipQueue: string[];
  currentIndex: number;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  displayName: string;
  activeSessions: string[];
  totalSipsViewed: number;
  streak: number;
  bookmarks: string[];
  createdAt: string;
}

// API request/response types

export interface CreateSessionRequest {
  topic: string;
  sourceUrl?: string;
}

export interface CreateSessionResponse {
  id: string;
  topic: string;
  skeleton: SkeletonNode[];
  sips: Sip[];
}

export interface GetSipsResponse {
  sips: Sip[];
  hasMore: boolean;
  currentIndex: number;
}

export interface InteractRequest {
  reaction: "liked" | "skipped" | "bookmarked";
}

export interface InteractResponse {
  ok: boolean;
  queueUpdated: boolean;
  newSipsAdded: number;
}
