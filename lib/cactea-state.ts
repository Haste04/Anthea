export type CacteaState =
  | "idle"
  | "wave"
  | "listening"
  | "thinking"
  | "speaking"
  | "success"
  | "error"
  | "sixSeven";

export type AgentMode = "idle" | "listening" | "speaking" | "processing";
export type CacteaFeedback = Extract<CacteaState, "success" | "error"> | null;

export function resolveCacteaState(
  mode: AgentMode,
  feedback: CacteaFeedback,
): CacteaState {
  if (feedback) return feedback;
  if (mode === "processing") return "thinking";
  return mode;
}
