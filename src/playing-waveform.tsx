import { Pause } from "lucide-react";

export function PlayingWaveform() {
  return (
    <span className="queue-playing-waveform" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

export function PlayingArtworkStatus({
  label,
  playing,
}: {
  label: string;
  playing: boolean;
}) {
  return (
    <span
      className="queue-artwork-status song-playing-status"
      role="img"
      aria-label={label}
      title={label}
    >
      {playing ? (
        <PlayingWaveform />
      ) : (
        <Pause size={18} fill="currentColor" aria-hidden="true" />
      )}
    </span>
  );
}
