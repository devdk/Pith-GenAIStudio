import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { Captions, type CaptionStyle, type CaptionWord } from "./Captions";

export const VERTICAL_WIDTH = 1080;
export const VERTICAL_HEIGHT = 1920;
export const VERTICAL_FPS = 30;

/**
 * commentary — full-bleed background + presenter window + captions
 * broll      — full-bleed background + captions (no face)
 * split      — presenter on top half, background on bottom half
 */
export type VerticalLayout = "commentary" | "broll" | "split";

export type VerticalVideoProps = {
  layout: VerticalLayout;
  /** Background/b-roll video in the public dir. Optional: falls back to a gradient. */
  backgroundSrc?: string;
  /** Presenter clip (already lip-synced, carries its own audio). */
  presenterSrc?: string;
  /** Narration audio — used when there is no presenter clip. */
  audioSrc?: string;
  durationInSeconds: number;
  words: CaptionWord[];
  captionStyle?: CaptionStyle;
  accent?: string;
  /** Persistent hook text pinned at the top (optional). */
  headline?: string;
  /** Brand wordmark shown as a small watermark. */
  brand?: string;
  /** Seconds of background to loop; when set the bg restarts every N seconds. */
  backgroundLoopSeconds?: number;
};

export const calculateVerticalMetadata: CalculateMetadataFunction<
  VerticalVideoProps
> = async ({ props }) => ({
  durationInFrames: Math.max(1, Math.round(props.durationInSeconds * VERTICAL_FPS)),
  fps: VERTICAL_FPS,
  width: VERTICAL_WIDTH,
  height: VERTICAL_HEIGHT,
});

const resolveSrc = (src: string): string =>
  /^([a-z]+:)?\/\//i.test(src) || src.startsWith("data:") ? src : staticFile(src);

/** Slow drifting gradient used when no background footage is supplied. */
const GradientBackdrop: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame * 0.01) * 120;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0F1E" }}>
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 1400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}40, transparent 70%)`,
          top: -300 + drift,
          left: -300,
          filter: "blur(40px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1200,
          height: 1200,
          borderRadius: "50%",
          background: "radial-gradient(circle, #FFD16626, transparent 70%)",
          bottom: -260 - drift,
          right: -260,
          filter: "blur(40px)",
        }}
      />
    </AbsoluteFill>
  );
};

/** Background video, cropped to fill and optionally looped. */
const Background: React.FC<{
  src?: string;
  accent: string;
  loopSeconds?: number;
  dim?: number;
}> = ({ src, accent, loopSeconds, dim = 0.28 }) => {
  const { fps, durationInFrames } = useVideoConfig();

  if (!src) return <GradientBackdrop accent={accent} />;

  const video = (
    <OffthreadVideo
      src={resolveSrc(src)}
      muted
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0F1E" }}>
      {loopSeconds && loopSeconds > 0.2 ? (
        <Loop durationInFrames={Math.max(1, Math.round(loopSeconds * fps))}>
          {video}
        </Loop>
      ) : (
        video
      )}
      {/* Darkening scrim so captions stay legible over any footage. */}
      <AbsoluteFill style={{ backgroundColor: `rgba(10,15,30,${dim})` }} />
      {/* Unused but keeps durationInFrames referenced for clarity in dev tools. */}
      <span style={{ display: "none" }}>{durationInFrames}</span>
    </AbsoluteFill>
  );
};

/** Rounded presenter window with accent border. */
const PresenterWindow: React.FC<{
  src: string;
  shape: "circle" | "rounded";
  accent: string;
  size: number;
}> = ({ src, shape, accent, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: shape === "circle" ? "50%" : 42,
        overflow: "hidden",
        border: `8px solid ${accent}`,
        boxShadow: `0 0 90px ${accent}66, 0 24px 60px rgba(0,0,0,0.6)`,
        transform: `scale(${enter})`,
      }}
    >
      <OffthreadVideo
        src={resolveSrc(src)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
  );
};

const Headline: React.FC<{ text: string; accent: string }> = ({ text, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const y = interpolate(enter, [0, 1], [-40, 0]);
  return (
    <div
      style={{
        transform: `translateY(${y}px)`,
        opacity: enter,
        background: "rgba(10,15,30,0.78)",
        border: `3px solid ${accent}`,
        borderRadius: 999,
        padding: "18px 44px",
        fontSize: 46,
        fontWeight: 800,
        color: "#FFFFFF",
        textAlign: "center",
        maxWidth: 900,
        fontFamily: "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {text}
    </div>
  );
};

export const VerticalVideo: React.FC<VerticalVideoProps> = ({
  layout,
  backgroundSrc,
  presenterSrc,
  audioSrc,
  words,
  captionStyle = "bold",
  accent = "#8c52ff",
  headline,
  brand,
  backgroundLoopSeconds,
}) => {
  const hasPresenter = Boolean(presenterSrc) && layout !== "broll";

  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0F1E" }}>
      {/* ---------- audio ---------- */}
      {/* The presenter clip carries lip-synced audio; otherwise play narration. */}
      {!hasPresenter && audioSrc ? <Audio src={resolveSrc(audioSrc)} /> : null}

      {/* ---------- layout ---------- */}
      {layout === "split" ? (
        <>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ height: "50%", overflow: "hidden", backgroundColor: "#0A0F1E" }}>
              {presenterSrc ? (
                <OffthreadVideo
                  src={resolveSrc(presenterSrc)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : null}
            </div>
            <div style={{ height: "50%", overflow: "hidden", position: "relative" }}>
              <Background
                src={backgroundSrc}
                accent={accent}
                loopSeconds={backgroundLoopSeconds}
                dim={0.15}
              />
            </div>
          </div>
          {/* Seam highlight between the two panes. */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              height: 6,
              background: accent,
              transform: "translateY(-3px)",
            }}
          />
        </>
      ) : (
        <Background
          src={backgroundSrc}
          accent={accent}
          loopSeconds={backgroundLoopSeconds}
          dim={layout === "commentary" ? 0.3 : 0.25}
        />
      )}

      {/* ---------- headline ---------- */}
      {headline ? (
        <div
          style={{
            position: "absolute",
            top: layout === "split" ? 60 : 120,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Headline text={headline} accent={accent} />
        </div>
      ) : null}

      {/* ---------- captions ---------- */}
      {/* Kept clear of the other elements: above the face-cam in commentary,
          inside the bottom pane (below the seam) in split, lower-third in broll.
          All sit above the platform's own UI overlay at the bottom of the frame. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: layout === "commentary" ? 660 : layout === "split" ? 300 : 470,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Captions
          words={words}
          accent={accent}
          style={captionStyle}
          fontSize={layout === "split" ? 74 : 86}
        />
      </div>

      {/* ---------- presenter window (commentary only) ---------- */}
      {layout === "commentary" && presenterSrc ? (
        <div style={{ position: "absolute", bottom: 150, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <PresenterWindow src={presenterSrc} shape="circle" accent={accent} size={420} />
        </div>
      ) : null}

      {/* ---------- brand watermark ---------- */}
      {brand ? (
        <div
          style={{
            position: "absolute",
            top: 46,
            right: 46,
            fontSize: 30,
            fontWeight: 700,
            color: "rgba(255,255,255,0.72)",
            fontFamily: "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif",
            textShadow: "0 2px 12px rgba(0,0,0,0.7)",
          }}
        >
          {brand}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
