"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSession, getSips, interactWithSip } from "@/lib/api";
import type { Session, Sip } from "@/lib/types";
import styles from "./page.module.css";

export default function SessionFeed() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [sips, setSips] = useState<Sip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [hasMore, setHasMore] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const fetchingMore = useRef(false);

  // Initial load
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      try {
        const [sess, initialSips] = await Promise.all([
          getSession(id),
          getSips(id, undefined, 10),
        ]);
        if (cancelled) return;
        setSession(sess);
        setSips(initialSips);
        if (initialSips.length < 10) setHasMore(false);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load session");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  // Infinite scroll — fetch more when scrolled past 70%
  const loadMore = useCallback(async () => {
    if (fetchingMore.current || !hasMore || sips.length === 0) return;
    fetchingMore.current = true;
    setLoadingMore(true);
    try {
      const lastOrder = sips[sips.length - 1].order;
      const newSips = await getSips(id, lastOrder, 5);
      if (newSips.length < 5) setHasMore(false);
      setSips((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const unique = newSips.filter((s) => !existingIds.has(s.id));
        return [...prev, ...unique];
      });
    } catch {
      // silently ignore — user can retry by scrolling
    } finally {
      setLoadingMore(false);
      fetchingMore.current = false;
    }
  }, [id, hasMore, sips]);

  // Scroll handler: track current card + trigger infinite scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onScroll() {
      if (!el) return;
      const cardHeight = el.clientHeight;
      const idx = Math.round(el.scrollTop / cardHeight);
      setCurrentIndex(idx);

      // trigger load at 70% threshold
      const scrollRatio = (el.scrollTop + cardHeight) / el.scrollHeight;
      if (scrollRatio > 0.7) loadMore();
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [loadMore]);

  async function handleReaction(sip: Sip, reaction: string) {
    try {
      await interactWithSip(sip.id, id, reaction);
      setSips((prev) =>
        prev.map((s) =>
          s.id === sip.id
            ? { ...s, userReaction: reaction as Sip["userReaction"] }
            : s
        )
      );
    } catch {
      // ignore
    }
  }

  function handleQuizSelect(sipId: string, option: string) {
    setQuizAnswers((prev) => ({ ...prev, [sipId]: option }));
  }

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
        <p>Loading your learning feed…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.loadingScreen}>
        <p className={styles.errorText}>{error}</p>
        <button className={styles.backBtn} onClick={() => router.push("/")}>
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push("/")}>
          ←
        </button>
        <span className={styles.topic}>{session?.topic}</span>
        <span className={styles.progress}>
          {sips.length > 0
            ? `Sip ${currentIndex + 1} of ${sips.length}`
            : ""}
        </span>
      </header>

      {/* Feed container */}
      <div className={styles.feed} ref={containerRef}>
        {sips.map((sip) => (
          <div className={styles.card} key={sip.id}>
            <div className={styles.cardInner}>
              {/* Title */}
              <h2 className={styles.sipTitle}>{sip.title}</h2>

              {/* Content */}
              <p className={styles.sipContent}>{sip.content}</p>

              {/* Interaction area */}
              {sip.interactionType === "quiz" && sip.interaction.options && (
                <div className={styles.quiz}>
                  {sip.interaction.question && (
                    <p className={styles.quizQuestion}>{sip.interaction.question}</p>
                  )}
                  <div className={styles.options}>
                    {sip.interaction.options.map((opt) => {
                      const selected = quizAnswers[sip.id];
                      const isThis = selected === opt;
                      const isCorrect = opt === sip.interaction.answer;
                      let optClass = styles.option;
                      if (selected) {
                        if (isThis && isCorrect) optClass += ` ${styles.correct}`;
                        else if (isThis && !isCorrect) optClass += ` ${styles.wrong}`;
                        else if (isCorrect) optClass += ` ${styles.correct}`;
                      }
                      return (
                        <button
                          key={opt}
                          className={optClass}
                          onClick={() => handleQuizSelect(sip.id, opt)}
                          disabled={!!selected}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  {quizAnswers[sip.id] && sip.interaction.hint && (
                    <p className={styles.hint}>💡 {sip.interaction.hint}</p>
                  )}
                </div>
              )}

              {(sip.interactionType === "flashcard" ||
                sip.interactionType === "summary") &&
                sip.interaction.answer && (
                  <div className={styles.takeaway}>
                    <span className={styles.takeawayLabel}>Key Takeaway</span>
                    <p>{sip.interaction.answer}</p>
                  </div>
                )}

              {sip.interactionType === "code-snippet" && sip.interaction.answer && (
                <pre className={styles.codeBlock}>
                  <code>{sip.interaction.answer}</code>
                </pre>
              )}

              {/* Visual hint badge */}
              {sip.visualHint && (
                <span className={styles.visualHint}>{sip.visualHint}</span>
              )}
            </div>

            {/* Actions bar */}
            <div className={styles.actions}>
              <button
                className={`${styles.actionBtn} ${sip.userReaction === "liked" ? styles.active : ""}`}
                onClick={() => handleReaction(sip, "liked")}
                title="Like"
              >
                ❤️
              </button>
              <button
                className={`${styles.actionBtn} ${sip.userReaction === "skipped" ? styles.active : ""}`}
                onClick={() => handleReaction(sip, "skipped")}
                title="Skip"
              >
                ⏭️
              </button>
              <button
                className={`${styles.actionBtn} ${sip.userReaction === "bookmarked" ? styles.active : ""}`}
                onClick={() => handleReaction(sip, "bookmarked")}
                title="Bookmark"
              >
                🔖
              </button>
            </div>
          </div>
        ))}

        {loadingMore && (
          <div className={styles.loadMore}>
            <div className={styles.loadingSpinner} />
          </div>
        )}

        {!hasMore && sips.length > 0 && (
          <div className={styles.endCard}>
            <p>🎉 You&apos;ve finished all sips!</p>
            <button className={styles.backBtn} onClick={() => router.push("/")}>
              Start a new topic
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
