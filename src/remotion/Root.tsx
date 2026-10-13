import React from "react";
import { Composition } from "remotion";
import { StoryVideo, calculateStoryMetadata } from "./StoryVideo";
import { CartoonVideo } from "./cartoon/CartoonVideo";
import { PresenterVideo, calculatePresenterMetadata } from "./presenter/PresenterVideo";
import {
  VerticalVideo,
  calculateVerticalMetadata,
  VERTICAL_FPS,
  VERTICAL_HEIGHT,
  VERTICAL_WIDTH,
} from "./vertical/VerticalVideo";
import {
  ClipReel,
  calculateClipMetadata,
  CLIP_FPS,
  CLIP_HEIGHT,
  CLIP_WIDTH,
} from "./clip/ClipReel";
import { sampleBeats } from "./sampleBeats";
import { FPS, HEIGHT, WIDTH } from "./theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="StoryVideo"
        component={StoryVideo}
        // Placeholder — the real duration is set by calculateMetadata. It must
        // be a positive integer here to satisfy the Studio before metadata runs.
        durationInFrames={600}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        calculateMetadata={calculateStoryMetadata}
        defaultProps={{
          beats: sampleBeats,
          // To test voiceover redistribution, drop an audio file in public/ and set:
          // voiceover: { src: staticFile("voiceover.mp3"), volume: 1 },
        }}
      />
      <Composition
        id="CartoonExplainer"
        component={CartoonVideo}
        durationInFrames={600}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        // Same timing/voiceover machinery as StoryVideo — only the skin differs.
        calculateMetadata={calculateStoryMetadata}
        defaultProps={{
          beats: sampleBeats,
        }}
      />
      <Composition
        id="PresenterVideo"
        component={PresenterVideo}
        durationInFrames={600}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        calculateMetadata={calculatePresenterMetadata}
        defaultProps={{
          videoSrc: "presenter.mp4",
          durationInSeconds: 20,
          segments: [],
        }}
      />
      {/* 9:16 reel formats — one composition, three layouts. */}
      <Composition
        id="VerticalVideo"
        component={VerticalVideo}
        durationInFrames={900}
        fps={VERTICAL_FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        calculateMetadata={calculateVerticalMetadata}
        defaultProps={{
          layout: "broll" as const,
          durationInSeconds: 20,
          words: [],
          accent: "#8c52ff",
        }}
      />
      {/* Clips mined from a long source, cut and captioned. */}
      <Composition
        id="ClipReel"
        component={ClipReel}
        durationInFrames={900}
        fps={CLIP_FPS}
        width={CLIP_WIDTH}
        height={CLIP_HEIGHT}
        calculateMetadata={calculateClipMetadata}
        defaultProps={{
          videoSrc: "clip.mp4",
          durationInSeconds: 30,
          words: [],
          layout: "card" as const,
          accent: "#8c52ff",
        }}
      />
    </>
  );
};
