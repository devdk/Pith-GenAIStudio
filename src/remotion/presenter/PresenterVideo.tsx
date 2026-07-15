import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import type { Beat } from "../types";
import { FONT_FAMILY, FPS, HEIGHT, WIDTH } from "../theme";

/**
 * PresenterVideo — a talking-head presenter video (with its own audio) pinned
 * in a circular frame, while story beats animate in a text zone above, each
 * starting at an exact narration timestamp (from speech-to-text alignment).
 */
export type PresenterSegment = {
  beat: Beat;
  /** When this beat appears, in seconds into the presenter video. */
  startSeconds: number;
  /** solution only: per-bullet reveal offsets (frames, relative to segment start). */
  bulletDelaysInFrames?: number[];
};

export type PresenterVideoProps = {
  /** Presenter video in the public dir (carries the narration audio). */
  videoSrc: string;
  /** Total video length in seconds — drives composition duration. */
  durationInSeconds: number;
  segments: PresenterSegment[];
  accent?: string;
};

const C = {
  bg: "#0A0F1E",
  panel: "#111834",
  white: "#EAF2FF",
  muted: "#8FA3C8",
  gold: "#FFD166",
};

export const calculatePresenterMetadata: CalculateMetadataFunction<
  PresenterVideoProps
> = async ({ props }) => ({
  durationInFrames: Math.max(1, Math.round(props.durationInSeconds * FPS)),
  fps: FPS,
  width: WIDTH,
  height: HEIGHT,
});

/* ------------------------------------------------------------------ */

const Pop: React.FC<{
  delay?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 11, stiffness: 130 } });
  return (
    <div style={{ transform: `scale(${s})`, opacity: Math.min(1, s * 1.4), ...style }}>
      {children}
    </div>
  );
};

const EyebrowPill: React.FC<{ text?: string; accent: string }> = ({ text, accent }) =>
  text ? (
    <Pop delay={2}>
      <div
        style={{
          display: "inline-block",
          background: `${accent}22`,
          border: `2px solid ${accent}`,
          color: C.white,
          borderRadius: 999,
          fontSize: 32,
          fontWeight: 600,
          letterSpacing: 2,
          textTransform: "uppercase",
          padding: "10px 34px",
          marginBottom: 40,
        }}
      >
        {text}
      </div>
    </Pop>
  ) : null;

const BigTitle: React.FC<{ text?: string; size?: number; delay?: number }> = ({
  text,
  size = 88,
  delay = 6,
}) =>
  text ? (
    <Pop delay={delay}>
      <h1 style={{ fontSize: size, fontWeight: 800, lineHeight: 1.1, margin: 0, color: C.white }}>
        {text}
      </h1>
    </Pop>
  ) : null;

/** Loading bar gag for the hook: fills fast, then stalls near the end. */
const StallingBar: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const pct = interpolate(
    frame,
    [10, 45, 75, 110, 140, 190],
    [0, 62, 64, 78, 79, 84],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );
  return (
    <Pop delay={12}>
      <div style={{ width: 620, margin: "44px auto 0" }}>
        <div
          style={{
            height: 26,
            borderRadius: 999,
            background: C.panel,
            border: `2px solid ${C.muted}44`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 999,
              background: `linear-gradient(90deg, ${accent}, ${accent}AA)`,
            }}
          />
        </div>
        <div style={{ fontSize: 30, color: C.muted, marginTop: 14 }}>
          loading… {Math.round(pct)}%
        </div>
      </div>
    </Pop>
  );
};

/** Floating £ coins for the problem beat. */
const CoinDrift: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {[0, 1, 2, 3].map((i) => {
        const cycle = 70;
        const t = (frame + i * 19) % cycle;
        const y = interpolate(t, [0, cycle], [0, -170]);
        const fade = interpolate(t, [0, 10, 50, cycle], [0, 0.9, 0.7, 0]);
        // Keep coins beneath the copy and clear of the presenter circle.
        const x = 140 + i * 160 + Math.sin((frame + i * 30) * 0.12) * 26;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: 830 + y,
              width: 74,
              height: 74,
              borderRadius: 999,
              background: C.gold,
              border: `4px solid ${C.bg}`,
              boxShadow: `0 0 24px ${C.gold}55`,
              color: C.bg,
              fontSize: 42,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: fade,
            }}
          >
            £
          </div>
        );
      })}
    </div>
  );
};

/* --------------------------- beat panels --------------------------- */

const HookPanel: React.FC<{ beat: Beat; accent: string }> = ({ beat, accent }) => (
  <>
    <EyebrowPill text={beat.eyebrow} accent={accent} />
    <BigTitle text={beat.title} size={96} />
    {beat.subtitle ? (
      <Pop delay={12}>
        <p style={{ fontSize: 46, color: C.muted, margin: "28px 0 0" }}>{beat.subtitle}</p>
      </Pop>
    ) : null}
    <StallingBar accent={accent} />
  </>
);

const StatPanel: React.FC<{ beat: Beat; accent: string }> = ({ beat, accent }) => {
  const frame = useCurrentFrame();
  const target = parseInt(beat.value ?? "0", 10) || 0;
  const n = Math.round(
    interpolate(frame, [6, 40], [0, target], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: (t) => 1 - (1 - t) * (1 - t),
    })
  );
  return (
    <>
      <Pop delay={2}>
        <div style={{ fontSize: 320, fontWeight: 800, lineHeight: 1, color: accent }}>
          {n}
          <span style={{ fontSize: 140, color: C.white }}>{beat.unit}</span>
        </div>
      </Pop>
      {beat.label ? (
        <Pop delay={14}>
          <div style={{ fontSize: 52, color: C.white, marginTop: 30, fontWeight: 600 }}>
            {beat.label}
          </div>
        </Pop>
      ) : null}
    </>
  );
};

const ProblemPanel: React.FC<{ beat: Beat; accent: string }> = ({ beat, accent }) => (
  <>
    <CoinDrift />
    <EyebrowPill text={beat.eyebrow} accent={accent} />
    <BigTitle text={beat.title} size={92} />
    {beat.body ? (
      <Pop delay={14}>
        <p style={{ fontSize: 48, color: C.muted, margin: "30px 0 0", maxWidth: 820 }}>
          {beat.body}
        </p>
      </Pop>
    ) : null}
  </>
);

const SolutionPanel: React.FC<{
  beat: Beat;
  accent: string;
  bulletDelays?: number[];
}> = ({ beat, accent, bulletDelays }) => (
  <>
    <EyebrowPill text={beat.eyebrow} accent={accent} />
    <BigTitle text={beat.title} size={84} delay={4} />
    <div
      style={{
        marginTop: 34,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        alignItems: "center",
      }}
    >
      {(beat.bullets ?? []).map((b, i) => (
        <Pop key={i} delay={bulletDelays?.[i] ?? 12 + i * 10}>
          <div
            style={{
              background: C.panel,
              border: `2px solid ${accent}66`,
              borderRadius: 20,
              padding: "16px 36px",
              fontSize: 42,
              fontWeight: 600,
              color: C.white,
              display: "flex",
              alignItems: "center",
              gap: 22,
            }}
          >
            <span
              style={{
                background: accent,
                borderRadius: 999,
                width: 52,
                height: 52,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                color: C.white,
                flexShrink: 0,
              }}
            >
              ✓
            </span>
            {b}
          </div>
        </Pop>
      ))}
    </div>
  </>
);

const CtaPanel: React.FC<{ beat: Beat; accent: string }> = ({ beat, accent }) => {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame * 0.2) * 0.04;
  return (
    <>
      <BigTitle text={beat.title} size={100} delay={2} />
      {beat.subtitle ? (
        <Pop delay={10}>
          <div
            style={{
              display: "inline-block",
              background: C.panel,
              border: `2px solid ${C.muted}55`,
              borderRadius: 16,
              padding: "18px 46px",
              fontSize: 52,
              fontWeight: 600,
              color: C.white,
              marginTop: 46,
            }}
          >
            {beat.subtitle}
          </div>
        </Pop>
      ) : null}
      {beat.cta ? (
        <Pop delay={16}>
          <div
            style={{
              display: "inline-block",
              background: accent,
              borderRadius: 999,
              padding: "26px 78px",
              fontSize: 56,
              fontWeight: 700,
              color: C.white,
              marginTop: 52,
              transform: `scale(${pulse})`,
              boxShadow: `0 0 60px ${accent}66`,
            }}
          >
            {beat.cta} →
          </div>
        </Pop>
      ) : null}
    </>
  );
};

const LogoPanel: React.FC<{ beat: Beat; accent: string }> = ({ beat, accent }) => (
  <>
    <Pop delay={2}>
      <div style={{ fontSize: 130, fontWeight: 800, color: C.white }}>
        {beat.brand?.slice(0, 4)}
        <span style={{ color: accent }}>{beat.brand?.slice(4)}</span>
      </div>
    </Pop>
    {beat.tagline ? (
      <Pop delay={10}>
        <div style={{ fontSize: 46, color: C.muted, marginTop: 26 }}>{beat.tagline}</div>
      </Pop>
    ) : null}
  </>
);

const PanelFor: React.FC<{ seg: PresenterSegment; accent: string }> = ({ seg, accent }) => {
  const { beat } = seg;
  switch (beat.type) {
    case "hook":
      return <HookPanel beat={beat} accent={accent} />;
    case "stat":
      return <StatPanel beat={beat} accent={accent} />;
    case "problem":
    case "insight":
      return <ProblemPanel beat={beat} accent={accent} />;
    case "solution":
      return (
        <SolutionPanel beat={beat} accent={accent} bulletDelays={seg.bulletDelaysInFrames} />
      );
    case "cta":
      return <CtaPanel beat={beat} accent={accent} />;
    case "logo":
      return <LogoPanel beat={beat} accent={accent} />;
    default:
      return null;
  }
};

/** Fade a segment out over its final frames so cuts feel soft. */
const SegmentShell: React.FC<{
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        opacity: out,
        alignItems: "center",
        justifyContent: "flex-start",
        textAlign: "center",
        paddingTop: 110,
        paddingLeft: 70,
        paddingRight: 70,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */

export const PresenterVideo: React.FC<PresenterVideoProps> = ({
  videoSrc,
  durationInSeconds,
  segments,
  accent = "#8c52ff",
}) => {
  const frame = useCurrentFrame();
  const totalFrames = Math.round(durationInSeconds * FPS);
  const starts = segments.map((s) => Math.round(s.startSeconds * FPS));
  const presenterIn = spring({
    frame,
    fps: FPS,
    config: { damping: 12, stiffness: 110 },
  });
  const drift = Math.sin(frame * 0.05) * 30;

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, fontFamily: FONT_FAMILY }}>
      {/* ambient background blobs */}
      <div
        style={{
          position: "absolute",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}2E, transparent 70%)`,
          top: -220 + drift,
          left: -180,
          filter: "blur(30px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.gold}1A, transparent 70%)`,
          bottom: -200 - drift,
          right: -160,
          filter: "blur(30px)",
        }}
      />

      {/* beat panels, at exact narration timestamps */}
      {segments.map((seg, i) => {
        const from = starts[i];
        const dur = (i + 1 < starts.length ? starts[i + 1] : totalFrames) - from;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <SegmentShell durationInFrames={dur}>
              <PanelFor seg={seg} accent={accent} />
            </SegmentShell>
          </Sequence>
        );
      })}

      {/* presenter — circular frame, bottom-right, carries the audio */}
      <div
        style={{
          position: "absolute",
          right: 56,
          bottom: 56,
          width: 330,
          height: 330,
          borderRadius: "50%",
          overflow: "hidden",
          border: `6px solid ${accent}`,
          boxShadow: `0 0 70px ${accent}55, 0 18px 50px rgba(0,0,0,0.55)`,
          transform: `scale(${presenterIn})`,
        }}
      >
        <OffthreadVideo
          src={staticFile(videoSrc)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>

      {/* narration progress line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: 10,
          width: `${(frame / totalFrames) * 100}%`,
          background: accent,
        }}
      />
    </AbsoluteFill>
  );
};
