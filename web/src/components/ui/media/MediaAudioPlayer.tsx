export type MediaAudioPlayerProps = {
  src: string;
  onError?: () => void;
};

export function MediaAudioPlayer({ src, onError }: MediaAudioPlayerProps) {
  return (
    <audio
      key={src}
      controls
      className="w-full"
      preload="metadata"
      onError={onError}
      data-testid="media-audio-player"
    >
      <source src={src} />
      Your browser does not support the audio element.
    </audio>
  );
}
