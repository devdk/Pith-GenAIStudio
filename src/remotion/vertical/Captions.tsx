import React, { useMemo } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/** A transcript word with its start/end time in seconds. */
export type CaptionWord = { text: string; start: number; end: number };

export type CaptionStyle = "bold" | "karaoke" | "boxed";

type Group = { words: CaptionWord[]; start: number; end: number };

/**
 * Chunk words into short caption groups (the 2–4 words-on-screen look used by
 * Reels/TikTok). A group is closed by word count, by a long gap in speech, or
 * by sentence-ending punctuation so lines break where the speaker pauses.
 */
export function groupWords(
  words: CaptionWord[],
  maxWords = 3,
  maxGapSeconds = 0.45
): Group[] {
  const groups: Group[] = [];
  let current: CaptionWord[] = [];

  const flush = () => {
    if (!current.length) return;
    groups.push({
      words: current,
      start: current[0].start,
      end: current[current.length - 1].end,
    });
    current = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = words[i - 1];
    if (prev && w.start - prev.end > maxGapSeconds) flush();
    current.push(w);
    if (current.length >= maxWords || /[.!?]$/.test(w.text)) flush();
  }
  flush();
  return groups;
}

/**
 * Word-synced captions burned into the frame. Each group pops in on its first
 * word; within a group the currently-spoken word is highlighted in the accent
 * color, which is what makes the captions feel locked to the audio.
 */
export const Captions: React.FC<{
  words: CaptionWord[];
  accent?: string;
  style?: CaptionStyle;
  /** Font size in px at 1080-wide. */
  fontSize?: number;
  maxWordsPerGroup?: number;
}> = ({ words, accent = "#8c52ff", style = "bold", fontSize = 86, maxWordsPerGroup = 3 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const groups = useMemo(
    () => groupWords(words, maxWordsPerGroup),
    [words, maxWordsPerGroup]
  );

  // Hold the last group briefly past its end so captions don't flicker off
  // during short pauses between phrases.
  const active = groups.find((g) => t >= g.start && t <= g.end + 0.18);
  if (!active) return null;

  const enter = spring({
    frame: Math.round((t - active.start) * fps),
    fps,
    config: { damping: 13, stiffness: 200 },
  });
  const scale = interpolate(enter, [0, 1], [0.82, 1]);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: "0 18px",
        transform: `scale(${scale})`,
        padding: "0 60px",
      }}
    >
      {active.words.map((w, i) => {
        const spoken = t >= w.start - 0.02;
        const isCurrent = t >= w.start - 0.02 && t <= w.end + 0.02;

        const base: React.CSSProperties = {
          fontSize,
          fontWeight: 900,
          lineHeight: 1.12,
          letterSpacing: -1,
          textTransform: "uppercase",
          fontFamily:
            "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        };

        if (style === "boxed") {
          return (
            <span
              key={i}
              style={{
                ...base,
                color: isCurrent ? "#0A0F1E" : "#FFFFFF",
                background: isCurrent ? accent : "rgba(10,15,30,0.82)",
                borderRadius: 14,
                padding: "6px 18px",
                marginBottom: 12,
              }}
            >
              {w.text}
            </span>
          );
        }

        // "bold" and "karaoke" share the heavy-stroke look; karaoke dims words
        // that haven't been spoken yet, bold keeps them all visible.
        return (
          <span
            key={i}
            style={{
              ...base,
              color: isCurrent ? accent : "#FFFFFF",
              opacity: style === "karaoke" && !spoken ? 0.45 : 1,
              // Thick dark outline + drop shadow keeps text legible on any footage.
              WebkitTextStroke: "10px #0A0F1E",
              paintOrder: "stroke fill",
              textShadow: "0 8px 26px rgba(0,0,0,0.65)",
              transform: isCurrent ? "translateY(-6px)" : "none",
              marginBottom: 12,
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};
