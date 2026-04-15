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
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    try {
      const session = await createSession(topic.trim(), sourceUrl.trim() || undefined);
      router.push(`/session/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
      setLoading(false);
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
            required
          />
          <input
            className={styles.input}
            type="url"
            placeholder="Optional: paste an MS Learn URL"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            disabled={loading}
          />
          <button className={styles.button} type="submit" disabled={loading || !topic.trim()}>
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
