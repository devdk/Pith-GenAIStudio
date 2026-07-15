import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Beat } from "../types";

/**
 * Cartoon palette — bright flat colors, thick ink outlines, cream paper bg.
 * Deliberately separate from the corporate StoryVideo theme.
 */
export const CARTOON = {
  bg: "#FFF6E5",
  ink: "#20223A",
  red: "#FF6B6B",
  yellow: "#FFD93D",
  teal: "#3EC9B0",
  purple: "#8c52ff",
  white: "#FFFFFF",
} as const;

const FONT =
  "'Comic Sans MS', 'Comic Neue', 'Segoe Print', 'Chalkboard SE', cursive";

/** Slow hand-drawn wobble, in degrees. */
const useWobble = (amp = 2, speed = 0.35, phase = 0): number => {
  const frame = useCurrentFrame();
  return Math.sin(frame * speed + phase) * amp;
};

/** Springy pop-in wrapper (scale from 0 with overshoot). */
const Pop: React.FC<{
  delay?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 9, stiffness: 120 } });
  return <div style={{ transform: `scale(${s})`, ...style }}>{children}</div>;
};

/** Comic sticker card: white fill, fat ink border, offset hard shadow. */
const sticker = (bg: string = CARTOON.white): React.CSSProperties => ({
  background: bg,
  border: `7px solid ${CARTOON.ink}`,
  borderRadius: 36,
  boxShadow: `12px 12px 0 ${CARTOON.ink}`,
});

/** Polka-dot paper background shared by every cartoon scene. */
const Paper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      backgroundColor: CARTOON.bg,
      backgroundImage: `radial-gradient(${CARTOON.ink}14 12px, transparent 13px)`,
      backgroundSize: "110px 110px",
      fontFamily: FONT,
      color: CARTOON.ink,
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: 70,
    }}
  >
    {children}
  </AbsoluteFill>
);

const Eyebrow: React.FC<{ text?: string; bg?: string }> = ({ text, bg }) =>
  text ? (
    <Pop delay={2}>
      <div
        style={{
          ...sticker(bg ?? CARTOON.yellow),
          display: "inline-block",
          fontSize: 38,
          fontWeight: 700,
          padding: "12px 36px",
          borderRadius: 999,
          boxShadow: `8px 8px 0 ${CARTOON.ink}`,
          marginBottom: 44,
          transform: "rotate(-2deg)",
        }}
      >
        {text}
      </div>
    </Pop>
  ) : null;

const Title: React.FC<{ text?: string; size?: number; delay?: number }> = ({
  text,
  size = 92,
  delay = 6,
}) =>
  text ? (
    <Pop delay={delay}>
      <h1
        style={{
          fontSize: size,
          fontWeight: 800,
          lineHeight: 1.12,
          margin: 0,
          textShadow: `5px 5px 0 ${CARTOON.yellow}`,
        }}
      >
        {text}
      </h1>
    </Pop>
  ) : null;

/* ------------------------------------------------------------------ */
/* Cartoon characters (inline SVG doodles)                             */
/* ------------------------------------------------------------------ */

/** A drowsy browser window with a loading spinner and Zzz. */
const SleepyBrowser: React.FC = () => {
  const frame = useCurrentFrame();
  const wobble = useWobble(2.5, 0.25);
  const spin = (frame * 6) % 360;
  const zFloat = (i: number) =>
    interpolate((frame + i * 25) % 75, [0, 75], [0, -46]);
  const zFade = (i: number) =>
    interpolate((frame + i * 25) % 75, [0, 55, 75], [0.9, 0.4, 0]);

  return (
    <svg width="480" height="400" viewBox="0 0 480 400" style={{ transform: `rotate(${wobble}deg)` }}>
      {/* window */}
      <rect x="30" y="60" width="380" height="300" rx="28" fill={CARTOON.white} stroke={CARTOON.ink} strokeWidth="9" />
      <path d="M30 130 h380" stroke={CARTOON.ink} strokeWidth="9" />
      <circle cx="72" cy="95" r="12" fill={CARTOON.red} stroke={CARTOON.ink} strokeWidth="6" />
      <circle cx="116" cy="95" r="12" fill={CARTOON.yellow} stroke={CARTOON.ink} strokeWidth="6" />
      <circle cx="160" cy="95" r="12" fill={CARTOON.teal} stroke={CARTOON.ink} strokeWidth="6" />
      {/* sleepy face */}
      <path d="M140 220 q22 20 44 0" stroke={CARTOON.ink} strokeWidth="8" fill="none" strokeLinecap="round" />
      <path d="M250 220 q22 20 44 0" stroke={CARTOON.ink} strokeWidth="8" fill="none" strokeLinecap="round" />
      <ellipse cx="217" cy="285" rx="26" ry={16 + Math.sin(frame * 0.18) * 6} fill={CARTOON.ink} />
      {/* spinner */}
      <g transform={`rotate(${spin} 340 300)`}>
        <circle cx="340" cy="300" r="26" stroke={CARTOON.purple} strokeWidth="10" fill="none" strokeDasharray="120 45" strokeLinecap="round" />
      </g>
      {/* Zzz */}
      {[0, 1, 2].map((i) => (
        <text
          key={i}
          x={400 + i * 18}
          y={70 + zFloat(i)}
          fontSize={40 + i * 8}
          fontFamily={FONT}
          fontWeight="bold"
          fill={CARTOON.ink}
          opacity={zFade(i)}
        >
          z
        </text>
      ))}
    </svg>
  );
};

/** A cheery snail — the universal mascot of slow. */
const Snail: React.FC<{ size?: number }> = ({ size = 190 }) => {
  const wobble = useWobble(4, 0.3, 1.5);
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 260 188" style={{ transform: `rotate(${wobble}deg)` }}>
      <path d="M30 168 q100 26 200 0" stroke={CARTOON.ink} strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M42 168 q-4 -60 46 -64 q60 -6 62 40 l0 24 Z" fill={CARTOON.teal} stroke={CARTOON.ink} strokeWidth="8" />
      <circle cx="170" cy="112" r="56" fill={CARTOON.yellow} stroke={CARTOON.ink} strokeWidth="9" />
      <path d="M170 112 a34 34 0 0 1 34 -30 a22 22 0 0 1 -12 40 a12 12 0 0 1 -22 -10" fill="none" stroke={CARTOON.ink} strokeWidth="7" strokeLinecap="round" />
      <path d="M62 108 q-8 -34 -20 -44 M96 104 q2 -36 12 -50" stroke={CARTOON.ink} strokeWidth="8" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="58" r="11" fill={CARTOON.ink} />
      <circle cx="110" cy="48" r="11" fill={CARTOON.ink} />
      <path d="M52 132 q10 10 22 2" stroke={CARTOON.ink} strokeWidth="7" fill="none" strokeLinecap="round" />
    </svg>
  );
};

/** A pound coin with flapping wings, escaping upward. */
const WingedCoin: React.FC<{ index: number }> = ({ index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cycle = 80;
  const t = (frame + index * 26) % cycle;
  const rise = interpolate(t, [0, cycle], [0, -300]);
  const drift = Math.sin((t + index * 12) * 0.15) * 34;
  const fade = interpolate(t, [0, 12, 60, cycle], [0, 1, 1, 0]);
  const flap = Math.sin(frame * 0.9 + index) * 24;
  const entrance = spring({ frame: frame - index * 5, fps, config: { damping: 10 } });

  return (
    <g transform={`translate(${drift}, ${rise})`} opacity={fade * entrance}>
      <path d={`M-46 -8 q-34 ${-22 - flap} -52 2 q22 18 52 12 Z`} fill={CARTOON.white} stroke={CARTOON.ink} strokeWidth="6" />
      <path d={`M46 -8 q34 ${-22 - flap} 52 2 q-22 18 -52 12 Z`} fill={CARTOON.white} stroke={CARTOON.ink} strokeWidth="6" />
      <circle r="42" fill={CARTOON.yellow} stroke={CARTOON.ink} strokeWidth="8" />
      <text y="16" textAnchor="middle" fontSize="46" fontWeight="bold" fontFamily={FONT} fill={CARTOON.ink}>
        £
      </text>
    </g>
  );
};

/** Rocket-powered browser window zooming up. */
const RocketSite: React.FC = () => {
  const frame = useCurrentFrame();
  const wobble = useWobble(2, 0.4);
  const flame = 1 + Math.sin(frame * 0.8) * 0.25;
  return (
    <svg width="330" height="330" viewBox="0 0 330 330" style={{ transform: `rotate(${wobble}deg)` }}>
      <g transform="rotate(-12 165 165)">
        <rect x="70" y="60" width="190" height="150" rx="20" fill={CARTOON.white} stroke={CARTOON.ink} strokeWidth="9" />
        <path d="M70 100 h190" stroke={CARTOON.ink} strokeWidth="9" />
        <circle cx="98" cy="80" r="8" fill={CARTOON.red} stroke={CARTOON.ink} strokeWidth="5" />
        <circle cx="126" cy="80" r="8" fill={CARTOON.yellow} stroke={CARTOON.ink} strokeWidth="5" />
        {/* happy face */}
        <circle cx="130" cy="140" r="10" fill={CARTOON.ink} />
        <circle cx="200" cy="140" r="10" fill={CARTOON.ink} />
        <path d="M130 172 q35 30 70 0" stroke={CARTOON.ink} strokeWidth="8" fill="none" strokeLinecap="round" />
        {/* fins */}
        <path d="M70 190 l-34 44 l44 -8 Z" fill={CARTOON.red} stroke={CARTOON.ink} strokeWidth="7" />
        <path d="M260 190 l34 44 l-44 -8 Z" fill={CARTOON.red} stroke={CARTOON.ink} strokeWidth="7" />
        {/* flame */}
        <g transform={`translate(165 218) scale(${flame})`}>
          <path d="M-28 0 q28 66 56 0 q-14 22 -28 10 q-14 12 -28 -10 Z" fill={CARTOON.yellow} stroke={CARTOON.ink} strokeWidth="7" />
        </g>
      </g>
      {/* speed lines */}
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${36 + i * 20} ${250 + i * 26} l-26 30`}
          stroke={CARTOON.ink}
          strokeWidth="8"
          strokeLinecap="round"
          opacity={0.35 + ((frame + i * 8) % 20 < 10 ? 0.4 : 0)}
        />
      ))}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* Beat scenes                                                         */
/* ------------------------------------------------------------------ */

const CartoonHook: React.FC<{ beat: Beat }> = ({ beat }) => (
  <Paper>
    <Eyebrow text={beat.eyebrow} />
    <Pop delay={4}>
      <div style={{ position: "relative", display: "inline-block" }}>
        <SleepyBrowser />
        <div style={{ position: "absolute", top: -66, right: -60 }}>
          <Snail />
        </div>
      </div>
    </Pop>
    <Title text={beat.title} delay={10} />
    {beat.subtitle ? (
      <Pop delay={16}>
        <p style={{ fontSize: 48, margin: "26px 0 0", opacity: 0.85 }}>{beat.subtitle}</p>
      </Pop>
    ) : null}
  </Paper>
);

const CartoonStat: React.FC<{ beat: Beat }> = ({ beat }) => {
  const wobble = useWobble(1.6, 0.3);
  return (
    <Paper>
      <Pop delay={3}>
        <div
          style={{
            ...sticker(),
            padding: "40px 90px 56px",
            transform: `rotate(${wobble}deg)`,
          }}
        >
          <span style={{ fontSize: 300, fontWeight: 800, color: CARTOON.red, textShadow: `9px 9px 0 ${CARTOON.ink}` }}>
            {beat.value}
          </span>
          {beat.unit ? (
            <span style={{ fontSize: 130, fontWeight: 800, marginLeft: 12 }}>{beat.unit}</span>
          ) : null}
        </div>
      </Pop>
      {beat.label ? (
        <Pop delay={12}>
          <div
            style={{
              ...sticker(CARTOON.teal),
              marginTop: 60,
              padding: "24px 48px",
              fontSize: 50,
              fontWeight: 700,
              color: CARTOON.white,
              WebkitTextStroke: `1px ${CARTOON.ink}`,
              transform: "rotate(1.5deg)",
            }}
          >
            {beat.label}
          </div>
        </Pop>
      ) : null}
    </Paper>
  );
};

const CartoonProblem: React.FC<{ beat: Beat }> = ({ beat }) => (
  <Paper>
    <Eyebrow text={beat.eyebrow} bg={CARTOON.red} />
    <Pop delay={4}>
      <svg width="560" height="330" viewBox="0 0 560 330">
        {/* laptop */}
        <rect x="150" y="130" width="260" height="150" rx="16" fill={CARTOON.white} stroke={CARTOON.ink} strokeWidth="9" />
        <path d="M110 280 h340 l26 34 h-392 Z" fill={CARTOON.teal} stroke={CARTOON.ink} strokeWidth="8" />
        {/* sad face on screen */}
        <circle cx="240" cy="185" r="9" fill={CARTOON.ink} />
        <circle cx="320" cy="185" r="9" fill={CARTOON.ink} />
        <path d="M240 240 q40 -26 80 0" stroke={CARTOON.ink} strokeWidth="8" fill="none" strokeLinecap="round" />
        {/* escaping coins */}
        <g transform="translate(280 120)">
          {[0, 1, 2].map((i) => (
            <WingedCoin key={i} index={i} />
          ))}
        </g>
      </svg>
    </Pop>
    <Title text={beat.title} size={84} delay={10} />
    {beat.body ? (
      <Pop delay={16}>
        <p style={{ fontSize: 46, margin: "26px 0 0", opacity: 0.85, maxWidth: 820 }}>{beat.body}</p>
      </Pop>
    ) : null}
  </Paper>
);

const CartoonSolution: React.FC<{ beat: Beat }> = ({ beat }) => (
  <Paper>
    <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
      <Pop delay={4}>
        <RocketSite />
      </Pop>
      <div style={{ textAlign: "left", maxWidth: 560 }}>
        <Eyebrow text={beat.eyebrow} bg={CARTOON.teal} />
        <Title text={beat.title} size={78} delay={8} />
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 26 }}>
          {(beat.bullets ?? []).map((b, i) => (
            <Pop key={i} delay={14 + i * 9}>
              <div
                style={{
                  ...sticker(),
                  borderRadius: 24,
                  boxShadow: `8px 8px 0 ${CARTOON.ink}`,
                  padding: "18px 30px",
                  fontSize: 42,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  transform: `rotate(${i % 2 === 0 ? -1.2 : 1.2}deg)`,
                }}
              >
                <span
                  style={{
                    background: CARTOON.yellow,
                    border: `5px solid ${CARTOON.ink}`,
                    borderRadius: 999,
                    width: 56,
                    height: 56,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 34,
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
      </div>
    </div>
  </Paper>
);

const CartoonCta: React.FC<{ beat: Beat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame * 0.22) * 0.045;
  return (
    <Paper>
      <Title text={beat.title} size={104} delay={3} />
      {beat.subtitle ? (
        <Pop delay={10}>
          <div
            style={{
              ...sticker(),
              marginTop: 50,
              padding: "20px 52px",
              fontSize: 54,
              fontWeight: 700,
              transform: "rotate(-1.5deg)",
            }}
          >
            {beat.subtitle}
          </div>
        </Pop>
      ) : null}
      {beat.cta ? (
        <Pop delay={18}>
          <div
            style={{
              ...sticker(CARTOON.purple),
              marginTop: 64,
              padding: "28px 84px",
              borderRadius: 999,
              fontSize: 62,
              fontWeight: 800,
              color: CARTOON.white,
              transform: `scale(${pulse}) rotate(1deg)`,
            }}
          >
            {beat.cta} →
          </div>
        </Pop>
      ) : null}
    </Paper>
  );
};

const CartoonLogo: React.FC<{ beat: Beat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = (beat.brand ?? "").split("");
  return (
    <Paper>
      <div style={{ display: "flex" }}>
        {letters.map((ch, i) => {
          const s = spring({ frame: frame - i * 3, fps, config: { damping: 8, stiffness: 140 } });
          const bounce = Math.sin(frame * 0.25 + i * 0.7) * 7;
          return (
            <span
              key={i}
              style={{
                fontSize: 130,
                fontWeight: 800,
                color: i % 2 === 0 ? CARTOON.purple : CARTOON.ink,
                textShadow: `6px 6px 0 ${CARTOON.yellow}`,
                transform: `scale(${s}) translateY(${bounce}px)`,
                display: "inline-block",
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
      {beat.tagline ? (
        <Pop delay={letters.length * 3 + 6}>
          <div
            style={{
              ...sticker(CARTOON.yellow),
              marginTop: 54,
              padding: "16px 44px",
              borderRadius: 999,
              fontSize: 44,
              fontWeight: 700,
              transform: "rotate(-1.5deg)",
            }}
          >
            {beat.tagline}
          </div>
        </Pop>
      ) : null}
    </Paper>
  );
};

/** Dispatch a beat to its cartoon scene. insight reuses the problem layout. */
export const CartoonBeatRenderer: React.FC<{ beat: Beat }> = ({ beat }) => {
  switch (beat.type) {
    case "hook":
      return <CartoonHook beat={beat} />;
    case "stat":
      return <CartoonStat beat={beat} />;
    case "problem":
    case "insight":
      return <CartoonProblem beat={beat} />;
    case "solution":
      return <CartoonSolution beat={beat} />;
    case "cta":
      return <CartoonCta beat={beat} />;
    case "logo":
      return <CartoonLogo beat={beat} />;
    default:
      return null;
  }
};
