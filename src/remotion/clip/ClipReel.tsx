import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { Captions, type CaptionStyle, type CaptionWord } from "../vertical/Captions";

export const CLIP_WIDTH = 1080;
export const CLIP_HEIGHT = 1920;
export const CLIP_FPS = 30;

/**
 * Instagram's own chrome sits on top of the video: the handle and audio strip
 * along the top, and the caption, username and action buttons along the bottom
 * and right. Anything inside these margins risks being covered, so no text is
 * placed there.
 */
const SAFE_TOP = 180;
const SAFE_BOTTOM = 420;

export type ClipReelProps = {
  /** Pre-cut clip in the public dir — already trimmed to the exact range. */
  videoSrc: string;
  durationInSeconds: number;
  /** Word timings rebased so the clip starts at 0. */
  words: CaptionWord[];
  /** Burned over the opening — the single biggest lever on retention. */
  hookText?: string;
  hookSeconds?: number;
  /** card = video panel above a caption zone. fill = cropped full-bleed. */
  layout?: "card" | "fill";
  captionStyle?: CaptionStyle;
  accent?: string;
  brand?: string;
};

export const calculateClipMetadata: CalculateMetadataFunction<ClipReelProps> = async ({
  props,
}) => ({
  durationInFrames: Math.max(1, Math.round(props.durationInSeconds * CLIP_FPS)),
  fps: CLIP_FPS,
  width: CLIP_WIDTH,
  height: CLIP_HEIGHT,
});

const resolveSrc = (src: string): string =>
  /^([a-z]+:)?\/\//i.test(src) || src.startsWith("data:") ? src : staticFile(src);

/**
 * A thin bar that drains over the clip's length.
 *
 * Seeing how little is left measurably reduces early drop-off — viewers who can
 * see the end is near are more likely to watch to completion, and completion is
 * the signal short-form ranking cares about most.
 */
const ProgressBar: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = Math.min(100, (frame / Math.max(1, durationInFrames)) * 100);
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, background: "rgba(255,255,255,0.14)" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: accent }} />
    </div>
  );
};

/**
 * Slow, continuous scale drift on the video.
 *
 * Interview footage is visually static, and a frame that never changes is what
 * attention leaks through. A gentle push-in gives constant motion without ever
 * reading as a cut or a gimmick.
 */
function usePushIn(): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  // ~9s cycle, 2.5% travel: perceptible as liveliness, not as movement.
  return 1.02 + Math.sin((t / 9) * Math.PI * 2) * 0.025;
}

/** Full-bleed opening card carrying the hook line. */
const HookOverlay: React.FC<{
  text: string;
  seconds: number;
  accent: string;
}> = ({ text, seconds, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const endFrame = seconds * fps;
  if (frame > endFrame) return null;

  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 150 } });
  // Hold, then release quickly so the clip's own first words aren't buried.
  const out = interpolate(frame, [endFrame - 0.3 * fps, endFrame], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: `${SAFE_TOP}px 70px ${SAFE_BOTTOM}px`,
        background: "rgba(10,15,30,0.55)",
        opacity: out,
      }}
    >
      <div
        style={{
          transform: `scale(${0.88 + enter * 0.12})`,
          fontSize: 104,
          fontWeight: 900,
          lineHeight: 1.08,
          textAlign: "center",
          color: "#FFFFFF",
          letterSpacing: -2,
          WebkitTextStroke: `12px #0A0F1E`,
          paintOrder: "stroke fill",
          textShadow: `0 10px 40px rgba(0,0,0,0.7)`,
          fontFamily: "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {text}
      </div>
      <div
        style={{
          marginTop: 36,
          height: 10,
          width: 180,
          borderRadius: 999,
          background: accent,
          opacity: enter,
        }}
      />
    </AbsoluteFill>
  );
};

export const ClipReel: React.FC<ClipReelProps> = ({
  videoSrc,
  words,
  hookText,
  hookSeconds = 1.5,
  layout = "card",
  captionStyle = "bold",
  accent = "#8c52ff",
  brand,
}) => {
  const scale = usePushIn();
  const src = resolveSrc(videoSrc);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0F1E" }}>
      {layout === "fill" ? (
        <>
          {/* Blurred copy fills the frame so a 16:9 source never letterboxes
              onto black bars, which look like a mistake in a feed. */}
          <AbsoluteFill>
            <OffthreadVideo
              src={src}
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: "blur(45px) brightness(0.45)",
                transform: "scale(1.2)",
              }}
            />
          </AbsoluteFill>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
            <OffthreadVideo
              src={src}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: `scale(${scale})`,
              }}
            />
          </AbsoluteFill>
        </>
      ) : (
        <>
          {/* Card: the whole frame stays visible in a panel, with the lower
              third given over to captions. Nothing is cropped away, which
              matters when the speaker isn't centred. */}
          <AbsoluteFill
            style={{
              background: `radial-gradient(circle at 50% 18%, ${accent}26, transparent 62%), #0A0F1E`,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 300,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 1000,
                aspectRatio: "16 / 9",
                overflow: "hidden",
                borderRadius: 34,
                border: `5px solid ${accent}55`,
                boxShadow: "0 30px 90px rgba(0,0,0,0.65)",
              }}
            >
              <OffthreadVideo
                src={src}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: `scale(${scale})`,
                }}
              />
            </div>
          </div>
        </>
      )}

      {/* Captions sit above Instagram's bottom chrome in both layouts. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: layout === "card" ? 560 : SAFE_BOTTOM + 60,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Captions words={words} accent={accent} style={captionStyle} fontSize={82} />
      </div>

      {hookText ? (
        <HookOverlay text={hookText} seconds={hookSeconds} accent={accent} />
      ) : null}

      {brand ? (
        <div
          style={{
            position: "absolute",
            top: SAFE_TOP - 70,
            right: 56,
            fontSize: 30,
            fontWeight: 700,
            color: "rgba(255,255,255,0.7)",
            textShadow: "0 2px 12px rgba(0,0,0,0.8)",
            fontFamily: "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          {brand}
        </div>
      ) : null}

      <ProgressBar accent={accent} />
    </AbsoluteFill>
  );
};
