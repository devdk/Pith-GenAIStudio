import React from "react";
import { Composition } from "remotion";
import { StoryVideo, calculateStoryMetadata } from "./StoryVideo";
import { CartoonVideo } from "./cartoon/CartoonVideo";
import { PresenterVideo, calculatePresenterMetadata } from "./presenter/PresenterVideo";
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
    </>
  );
};
