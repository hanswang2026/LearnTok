export interface Sip {
  id: string;
  sessionId: string;
  order: number;
  title: string;
  content: string;
  interactionType: "quiz" | "flashcard" | "summary" | "code-snippet";
  interaction: {
    question?: string;
    options?: string[];
    answer?: string;
    hint?: string;
  };
  visualHint: string;
  depth: number;
  userReaction: "liked" | "skipped" | "bookmarked" | null;
}

export interface Session {
  id: string;
  topic: string;
  currentIndex: number;
  status: string;
  skeleton: unknown[];
}
