type Turn = { role: 'user' | 'assistant'; text: string };

export const CARE_QUESTIONS = {
  soil: 'Does the soil feel wet, damp, or dry a couple of inches below the surface?',
  watering: 'When did you last water this plant?',
  light: 'What kind of light does this plant get during the day?',
};

const wateringTime = /\b(?:today|yesterday|ago|daily|weekly|every|twice|once|last night|last week|last month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}\b/i;
const uncertain = /\b(?:not sure|unsure|don.t know|don.t remember|can.t tell|no idea)\b/i;
function careQuestionTopic(text: string): keyof typeof CARE_QUESTIONS | null {
  return (Object.keys(CARE_QUESTIONS) as (keyof typeof CARE_QUESTIONS)[]).find(key => text.includes(CARE_QUESTIONS[key]))
    ?? (/\blast time\b.{0,100}\bsoil\b.{0,100}\b(?:dried out|still|changed|become damp)\b/i.test(text) ? 'soil' : null);
}

function recalledSoilCondition(plantContext: string): string | null {
  const priorUserTurns = [...plantContext.matchAll(/Earlier conversation \([^)]*\) — user: ([\s\S]*?)(?=\nCactea:)/g)].map(match => match[1]);
  const savedNotes = plantContext.match(/User care notes: ([^\n]*)/)?.[1];
  for (const observation of [...priorUserTurns, ...(savedNotes ? [savedNotes] : [])]) {
    const condition = /\bsoil\b.{0,40}\b(?:felt|feels|was|is|seems?|stays?)?\s*(wet|damp|moist|dry|soggy)\b|\b(wet|damp|moist|dry|soggy)\b.{0,35}\bsoil\b/i.exec(observation);
    const value = condition?.[1] ?? condition?.[2];
    if (value) return value.toLowerCase();
  }
  return null;
}

function rememberedSoilQuestion(condition: string): string {
  if (condition === 'wet' || condition === 'damp' || condition === 'soggy') return `Last time, you mentioned the soil felt ${condition}. Has it dried out since then?`;
  if (condition === 'dry') return 'Last time, you mentioned the soil felt dry. Is it still dry, or has it become damp?';
  return `Last time, you mentioned the soil felt ${condition}. Does it still feel that way?`;
}

function plantSubject(text: string): string | null {
  const name = text.match(/\bmy\s+([a-z][a-z -]{0,50}?)(?=(?:['’]s)?\s+(?:has|have|is|are|feels?|needs?|looks?|gets?|receives?|leaves|leaf|soil|pot)\b|['’]s\b|[.!?]|$)/i)?.[1]?.trim().toLowerCase();
  return name && !/^(?:plant|plants|soil|leaves|leaf|pot|finger|guess|answer|question|yellow)(?:\s|$)/.test(name) ? name : null;
}

// These short triage questions are deterministic. Tool matches alone should
// never turn a yellow leaf into a confident diagnosis without care context.
export function yellowLeafFollowUp(transcript: string, history: Turn[], plantContext?: string): string | null {
  const yellowLeaves = (text: string) => /\byellow(?:ing)?\b/i.test(text) && /\b(?:leaves|leaf)\b/i.test(text);
  const last = history.at(-1);
  const currentQuestion = last?.role === 'assistant' ? careQuestionTopic(last.text) ?? undefined : undefined;
  const previousSubject = [...history].reverse().map(turn => turn.role === 'user' ? plantSubject(turn.text) : null).find(Boolean);
  const currentSubject = plantSubject(transcript);
  const changedPlant = Boolean(previousSubject && currentSubject && previousSubject !== currentSubject);
  const newSymptom = yellowLeaves(transcript);
  const questionOrSwitch = /\?|^\s*(?:how|why|what|who|where|when|can|could|should|would|tell|write|explain|give|show|create|play|sing|solve|calculate|recommend|now|another|different)\b|^\s*(?:i|we)\s+(?:want|need|would like)\b/i.test(transcript);
  // A moisture word in an unrelated sentence is not an answer about the soil.
  const soilAnswer = /^\s*(?:(?:it(?:['’]s| is| feels| seems)?|the soil(?: is| feels)?|soil(?: is| feels)?)\s+)?(?:wet|dry|damp|moist|soggy|dried out|has dried|has become damp)[.!]?\s*$/i.test(transcript);
  const wateringAnswer = /^\s*(?:(?:i|we) (?:last )?water(?:ed)?(?: it| the plant| this plant)?(?: on)?\s+)?(?:today|yesterday|last (?:night|week|month)|(?:on |last )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:once|twice) (?:a|per) (?:day|week|month)|every (?:day|week|month)|(?:about )?\d+ (?:hours?|days?|weeks?|months?) ago|never|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2})[.!]?\s*$/i.test(transcript);
  const lightAnswer = /^\s*(?:(?:it(?:['’]s| is| gets| receives)?|the plant(?: gets| receives)?)\s+)?(?:(?:bright|dim|low|direct|indirect|morning|afternoon|full)\s+)*(?:light|sun|sunlight|shade|shaded|sunny|bright|dim|indoors|outside|outdoors|(?:by|near|next to) (?:a|the) (?:sunny )?window)[.!]?\s*$/i.test(transcript);
  const uncertainAnswer = /^\s*(?:(?:i|we)(?:['’]m| am| are)?\s+)?(?:not sure|unsure|don.t know|don.t remember|can.t tell|no idea)[.!]?\s*$/i.test(transcript);
  const answersCurrentQuestion = uncertainAnswer || (currentQuestion === 'soil' ? soilAnswer : currentQuestion === 'watering' ? wateringAnswer : currentQuestion === 'light' ? lightAnswer : false);
  if (!newSymptom && (!currentQuestion || !answersCurrentQuestion || questionOrSwitch || changedPlant)) return null;
  const all = [...history, { role: 'user' as const, text: transcript }];
  // A newly described plant starts a fresh triage instead of inheriting facts.
  let start = all.findIndex(turn => turn.role === 'user' && yellowLeaves(turn.text));
  for (let i = start + 1; i < all.length; i++) {
    if (all[i].role === 'user' && /\b(?:another|different|new) plant\b|\b(?:switch|instead|now my)\b/i.test(all[i].text)) start = i;
  }
  if (changedPlant && newSymptom) start = all.length - 1;
  const relevant = all.slice(Math.max(0, start));
  const known = { soil: false, watering: false, light: false };
  for (let i = 0; i < relevant.length; i++) {
    const turn = relevant[i];
    if (turn.role !== 'user') continue;
    const previous = relevant[i - 1];
    // "I don't know" counts as an attempted answer; avoid an endless loop.
    if (previous?.role === 'assistant' && !/\?|^\s*(?:how|why|what)\b/i.test(turn.text)) {
      for (const key of Object.keys(known) as (keyof typeof known)[]) {
        if (careQuestionTopic(previous.text) === key) known[key] = true;
      }
    }
    if (/\bsoil\b.{0,65}\b(?:wet|dry|damp|moist|soggy)\b|\b(?:wet|dry|damp|moist|soggy)\b.{0,30}\bsoil\b/i.test(turn.text)) known.soil = true;
    if (/\bwater(?:ed|ing)?\b/i.test(turn.text) && (wateringTime.test(turn.text) || uncertain.test(turn.text))) known.watering = true;
    if (/\b(?:bright|indirect|direct|low|dim|morning|afternoon)\b.{0,30}\b(?:light|sun|sunlight)\b|\b(?:shade|shaded|sunny|full sun)\b/i.test(turn.text)) known.light = true;
  }
  for (const key of Object.keys(known) as (keyof typeof known)[]) {
    if (!known[key]) {
      if (key === 'soil' && plantContext && !changedPlant && !/\b(?:another|different|new) plant\b/i.test(transcript)) {
        const remembered = recalledSoilCondition(plantContext);
        if (remembered) return rememberedSoilQuestion(remembered);
      }
      return CARE_QUESTIONS[key];
    }
  }
  return null;
}

function plainText(text: string): string {
  return text.replace(/[`*_#]/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/[ \t]+/g, ' ').trim();
}

export function briefSpeech(text: string): string {
  const clean = plainText(text).replace(/\s+/g, ' ');
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(s => s.trim()) ?? [];
  if (!sentences.length) return clean;
  const next = sentences.slice(1).find(s => /^(?:check|inspect|feel|look|wait|let|keep|avoid|move|try|describe|tell|share)\b/i.test(s) || s.endsWith('?'));
  const selected = [sentences[0], next || sentences[1]].filter(Boolean).join(' ');
  const words = selected.split(/\s+/);
  return words.length <= 60 ? selected : `${words.slice(0, 58).join(' ')}…`;
}

export function parseAssistantReply(raw: string): { response_text: string; spoken_text: string; off_topic: boolean } {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (trimmed.startsWith('{')) {
    const value: unknown = JSON.parse(trimmed);
    if (!value || typeof value !== 'object' || !('response_text' in value) || typeof value.response_text !== 'string' || !value.response_text.trim()) throw new Error('The assistant returned an invalid answer.');
    const response_text = plainText(value.response_text).slice(0, 4000);
    const summary = 'spoken_text' in value && typeof value.spoken_text === 'string' && value.spoken_text.trim() ? value.spoken_text : response_text;
    return { response_text, spoken_text: briefSpeech(summary), off_topic: 'off_topic' in value && value.off_topic === true };
  }
  if (!trimmed) throw new Error('The assistant returned an empty answer.');
  const response_text = plainText(trimmed).slice(0, 4000);
  return { response_text, spoken_text: briefSpeech(response_text), off_topic: false };
}
