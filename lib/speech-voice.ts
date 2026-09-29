type Voice = { voiceURI: string; lang: string; default?: boolean };
export function configureSpeechVoice<T extends Voice>(utterance: { voice: T | null; lang: string }, voices: T[], voiceURI: string): void {
  const voice = voices.find(v => v.voiceURI === voiceURI) ?? voices.find(v => v.default) ?? voices.find(v => /^en\b/i.test(v.lang)) ?? voices[0];
  if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
}
