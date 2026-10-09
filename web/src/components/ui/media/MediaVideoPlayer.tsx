export type MediaVideoPlayerProps = {
  src: string;
  onError?: () => void;
};

export function MediaVideoPlayer({ src, onError }: MediaVideoPlayerProps) {
  return (
    <video
      key={src}
      controls
      className="w-full"
      preload="metadata"
      playsInline
      onError={onError}
      data-testid="media-video-player"
    >
      <source src={src} />
      Your browser does not support the video element.
    </video>
  );
}
