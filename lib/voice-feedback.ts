export function microphoneProblem(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  switch (name) {
    case 'NotAllowedError': return 'Microphone access was blocked. Open this site’s permissions beside the address bar, allow Microphone, then retry. Your question is still here.';
    case 'NotFoundError': return 'No microphone was found. Connect a microphone, then retry. You can also type your question.';
    case 'NotReadableError': return 'The microphone is busy or unavailable. Close another app using it, check your device settings, then retry.';
    case 'SecurityError': return 'Voice needs a secure page. Open Anthea over HTTPS (or localhost), or type your question.';
    default: return 'The microphone could not start. Check your connection and microphone settings, then retry or type. Your question is still here.';
  }
}

export function voiceHeading(mode: string, ready: boolean, transcribing: boolean, queued: boolean): string {
  if (mode === 'listening') return ready ? 'Cactea is listening' : 'Waiting for microphone access';
  if (mode === 'processing') return transcribing ? 'Turning your recording into words' : 'Cactea is thinking';
  if (mode === 'speaking') return 'Cactea is replying aloud';
  if (queued) return 'Preparing the spoken reply';
  return 'Ready for your voice question';
}

export function captureCaptionPresentation(liveAvailable: boolean, caption: string): { label: string; text: string } {
  const words = caption.trim();
  if (liveAvailable) {
    return { label: 'What I hear', text: words || 'Start speaking. Your words will appear here.' };
  }
  return {
    label: 'Recording audio',
    text: words || 'Keep speaking. Your question will be transcribed and sent when you finish.',
  };
}
