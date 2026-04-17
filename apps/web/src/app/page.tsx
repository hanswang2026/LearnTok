"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/api";
import styles from "./page.module.css";

export default function Home() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = topic.trim();
    const u = sourceUrl.trim();
    if (!t && !u) return;
    setLoading(true);
    setError("");
    try {
      // If only URL is provided, extract a topic from the URL path
      const effectiveTopic = t || extractTopicFromUrl(u);
      const session = await createSession(effectiveTopic, u || undefined);
      router.push(`/session/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
      setLoading(false);
    }
  }

  function extractTopicFromUrl(url: string): string {
    try {
      const path = new URL(url).pathname;
      // MS Learn URLs like /en-us/azure/azure-functions/functions-overview
      const segments = path.split("/").filter(Boolean);
      // Remove locale segment (e.g., "en-us")
      const filtered = segments.filter((s) => !s.match(/^[a-z]{2}-[a-z]{2}$/));
      // Use the last meaningful segments as the topic
      return filtered.slice(-2).join(" ").replace(/-/g, " ");
    } catch {
      return url;
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.brand}>
          <h1 className={styles.title}>
            <span className={styles.logo}>🧠</span> LearnTok
          </h1>
          <p className={styles.tagline}>Scroll to Learn. One Sip at a Time.</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            className={styles.input}
            type="text"
            placeholder="Enter a topic — e.g. Azure Functions"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={loading}
          />
          <input
            className={styles.input}
            type="url"
            placeholder="Or paste an MS Learn URL"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            disabled={loading}
          />
          <button className={styles.button} type="submit" disabled={loading || (!topic.trim() && !sourceUrl.trim())}>
            {loading ? (
              <span className={styles.spinner}>⏳ Generating sips…</span>
            ) : (
              "🚀 Start Learning"
            )}
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </form>
      </main>
    </div>
  );
}
