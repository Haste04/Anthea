import { transcribeAudio } from '@/lib/whisper';
import { normalizeVoiceVocabulary } from '@/lib/voice-vocabulary';

type Interaction = {
  status?: string;
  output_text?: string;
  steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
};

/** Dedicated ASR with the same name hints as live capture; local Whisper is the fallback. */
export async function transcribeRecording(buffer: Buffer, mimeType: string, vocabulary: string[], signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const key = process.env.GEMINI_API_KEY;
  if (key && key !== 'your_gemini_api_key_here') {
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          model: 'gemini-3.5-transcribe',
          store: false,
          input: [{ type: 'audio', data: buffer.toString('base64'), mime_type: mimeType === 'audio/mp4' ? 'audio/m4a' : mimeType === 'audio/x-wav' ? 'audio/wav' : mimeType }],
          generation_config: { transcription_config: {
            language_codes: [], custom_vocabulary: normalizeVoiceVocabulary(vocabulary),
          } },
        }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`Recorded ASR failed (${response.status})`);
      const result: Interaction = await response.json();
      if (result.status && result.status !== 'completed') throw new Error('Incomplete recorded ASR');
      const text = typeof result.output_text === 'string' ? result.output_text : result.steps
        ?.filter(step => step.type === 'model_output')
        .flatMap(step => step.content ?? [])
        .filter(content => content.type === 'text' && typeof content.text === 'string')
        .map(content => content.text).join(' ');
      if (typeof text !== 'string') throw new Error('Missing recorded ASR transcript');
      return text.trim();
    } catch {
      signal?.throwIfAborted();
      // Provider failures must still leave a usable recording path without a key.
    }
  }
  signal?.throwIfAborted();
  return transcribeAudio(buffer);
}
