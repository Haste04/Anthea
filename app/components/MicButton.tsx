"use client";

type MicButtonProps = {
  mode: "idle" | "listening" | "speaking" | "processing";
  speechSupported: boolean;
  onStartListen: () => void;
  onPushStart: () => void;
  onPushEnd: () => void;
  disabled?: boolean;
};

export default function MicButton({
  mode,
  speechSupported,
  onStartListen,
  onPushStart,
  onPushEnd,
  disabled,
}: MicButtonProps) {
  const busy = mode === "processing" || mode === "speaking";
  const listening = mode === "listening";

  if (!speechSupported) {
    return (
      <button
        type="button"
        className={`mic-btn ${listening ? "mic-btn--active" : ""}`}
        disabled={disabled || busy}
        onMouseDown={onPushStart}
        onMouseUp={onPushEnd}
        onMouseLeave={() => {
          if (listening) onPushEnd();
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          onPushStart();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          onPushEnd();
        }}
        aria-label="Hold to talk"
      >
        {listening ? "Release to send" : "Hold to talk"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`mic-btn ${listening ? "mic-btn--active" : ""}`}
      disabled={disabled || busy || listening}
      onClick={onStartListen}
      aria-label={listening ? "Listening" : "Start listening"}
    >
      {listening ? "Listening…" : busy ? "Please wait…" : "Tap to speak"}
    </button>
  );
}
