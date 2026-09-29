'use client';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { saveVoiceChoice, useDeviceVoices, useVoiceChoice } from '@/lib/voice-preferences-store';
import useSpeechPlayback from '@/app/dashboard/useSpeechPlayback';

const subscribe = () => () => {};
const playbackAvailable = () => Boolean(window.speechSynthesis);

export default function VoiceSettings() {
  const voices = useDeviceVoices();
  const choice = useVoiceChoice();
  const supported = useSyncExternalStore(subscribe, playbackAvailable, () => false);
  const [notice, setNotice] = useState('');
  const started = useCallback(() => setNotice('Playing your selected voice.'), []);
  const finished = useCallback(() => setNotice(''), []);
  const failed = useCallback(() => setNotice('The preview could not play. Check your volume, then try again.'), []);
  const { speak, stop, speakingMessageId, playbackPending } = useSpeechPlayback(started, finished, failed);
  const missing = Boolean(choice) && !voices.some(v => v.voiceURI === choice);
  return <section className="ws-panel ws-voice-settings" aria-labelledby="voice-settings-title">
    <h2 id="voice-settings-title">Cactea’s voice</h2>
    <p>Choose a voice available on this device. Preview it below to hear how Cactea will sound.</p>
    <label htmlFor="cactea-voice">Speaking voice</label>
    <select id="cactea-voice" value={missing ? '' : choice} disabled={!supported || !voices.length} onChange={event => { stop(); const saved = saveVoiceChoice(event.target.value); setNotice(saved ? 'Voice selected. Preview it below.' : 'Voice selected for this visit; browser storage is unavailable.'); }}>
      <option value="">Device default</option>
      {voices.map((voice, index) => <option key={`${voice.voiceURI}-${index}`} value={voice.voiceURI}>{voice.name} · {voice.lang}{voice.default ? ' · Default' : ''}</option>)}
    </select>
    {missing && <p>Your saved voice is unavailable here. Cactea will use the device default until you select another.</p>}
    {!voices.length && <p>{supported ? 'The browser has not provided any voices yet. The device default can still be previewed.' : 'Spoken replies are unavailable in this browser. You can read answers in chat.'}</p>}
    <div className="ws-actions"><button className="ws-secondary" type="button" disabled={!supported} onClick={() => speakingMessageId ? stop() : speak('Hi, I’m Cactea. Let’s check your plant’s soil before deciding what it needs.', 'voice-preview')}>{speakingMessageId ? 'Stop preview' : 'Preview voice'}</button></div>
    <p role="status" className="ws-muted">{playbackPending ? 'Preparing voice preview…' : notice}</p>
  </section>;
}
