export class AssistantRequestError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "AssistantRequestError";
  }
}

export function requestErrorMessage(error: unknown, context: "assistant" | "transcription" = "assistant"): string {
  if (error instanceof AssistantRequestError) return error.message;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "That took too long. Your question is still here—please try again.";
  }
  return context === "transcription"
    ? "I couldn’t transcribe that recording. Try recording again, or type your question."
    : "I couldn’t connect to Anthea. Check your connection and try again.";
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  // Error bodies may contain response_text. HTTP status determines success.
  if (!response.ok) {
    const message = response.status === 429
      ? "You’ve sent several questions recently. Please wait a moment before retrying."
      : response.status === 413
        ? "That question or recording is too long. Please shorten it and try again."
        : response.status === 503
          ? "Anthea is temporarily unavailable. Please wait a moment and try again."
        : response.status >= 500
          ? "Anthea couldn’t finish that request. Please try again."
          : "That request couldn’t be processed. Please try again.";
    throw new AssistantRequestError(message, response.status);
  }
  try { return await response.json() as T; }
  catch { throw new AssistantRequestError("Anthea returned an unreadable response. Please try again."); }
}
