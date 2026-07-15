import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { TransitionSeries } from "@remotion/transitions";
import type { StoryVideoProps } from "../types";
import { DEFAULT_TRANSITION_FRAMES, FPS } from "../theme";
import { baseSeqSum, resolveDurations } from "../timing";
import { getTransition } from "../transitions";
import { CARTOON, CartoonBeatRenderer } from "./CartoonBeats";

const resolveSrc = (src: string): string =>
  /^([a-z]+:)?\/\//i.test(src) || src.startsWith("data:") ? src : staticFile(src);

/**
 * Cartoon-styled sibling of StoryVideo: same props, same voiceover-synced
 * timing (share calculateStoryMetadata when registering), different skin.
 */
export const CartoonVideo: React.FC<StoryVideoProps> = ({
  beats,
  voiceover,
  transitionDurationInFrames = DEFAULT_TRANSITION_FRAMES,
  resolvedDurations,
}) => {
  const durations =
    resolvedDurations && resolvedDurations.length === beats.length
      ? resolvedDurations
      : resolveDurations(beats, baseSeqSum(beats));

  const dims = { width: 1080, height: 1080 };

  return (
    <AbsoluteFill style={{ backgroundColor: CARTOON.bg }}>
      {voiceover?.src ? (
        <Audio
          src={resolveSrc(voiceover.src)}
          volume={voiceover.volume ?? 1}
          startFrom={
            voiceover.startFromSeconds
              ? Math.round(voiceover.startFromSeconds * FPS)
              : undefined
          }
        />
      ) : null}

      <TransitionSeries>
        {beats.flatMap((beat, i) => {
          const seq = (
            <TransitionSeries.Sequence key={`beat-${i}`} durationInFrames={durations[i]}>
              <CartoonBeatRenderer beat={beat} />
            </TransitionSeries.Sequence>
          );

          if (i === 0) return [seq];

          const { presentation, timing } = getTransition(
            beat.type,
            i,
            transitionDurationInFrames,
            dims
          );

          return [
            <TransitionSeries.Transition
              key={`trans-${i}`}
              presentation={presentation}
              timing={timing}
            />,
            seq,
          ];
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
