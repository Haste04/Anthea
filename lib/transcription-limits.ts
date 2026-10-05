// Keep the complete multipart request below Vercel's 4.5 MB body limit.
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_TRANSCRIPTION_REQUEST_BYTES = MAX_AUDIO_BYTES + 64 * 1024;
