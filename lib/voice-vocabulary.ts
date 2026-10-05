import { plantSpeciesVocabulary } from '@/lib/plant-species';

export const MAX_VOICE_TERMS = 100;
const MAX_TERM_LENGTH = 120;
const commonNames = ['Aster', 'Cactea', 'Lifewood', 'orchid', 'cactus', 'rose', 'hibiscus', 'daisy', 'succulent', 'fern', 'Monstera'];

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function normalizeVoiceVocabulary(value: unknown, maxTerms = MAX_VOICE_TERMS): string[] {
  if (!Array.isArray(value)) return [];
  const limit = Math.max(1, Math.min(5000, Math.floor(maxTerms) || MAX_VOICE_TERMS));
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, Math.max(1000, limit * 2))) {
    if (typeof item !== 'string' || /[\u0000-\u001f\u007f]/.test(item)) continue;
    const term = item.trim().replace(/\s+/g, ' ');
    const key = normalize(term);
    if (!key || term.length > MAX_TERM_LENGTH || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === limit) break;
  }
  return terms;
}

export function buildPlantVocabulary(plants: { id: string; name: string; species: string }[], linkedId?: string, maxTerms = MAX_VOICE_TERMS): string[] {
  const linked = plants.find(plant => plant.id === linkedId);
  return normalizeVoiceVocabulary([
    ...(linked ? [linked.name, linked.species] : []),
    ...plants.flatMap(plant => [plant.name, plant.species]),
    ...commonNames,
    ...plantSpeciesVocabulary(),
  ], maxTerms);
}

export type PlantNameReview = {
  transcript: string; heard: string; start: number; end: number; suggestions: string[];
};

// Speech similarity is evidence for a question, never permission to rewrite a name.
function editDistance(left: string, right: string): number {
  let row = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 0; i < left.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < right.length; j++) {
      next[j + 1] = Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(left[i] !== right[j]));
    }
    row = next;
  }
  return row[right.length];
}

const genericSubject = /^(?:plant|plants|soil|leaves|leaf|pot|pots|roots|root|stem|stems|flowers|flower|garden|seed|seeds|water|watering|sunlight|light|window|room|house|balcony|friend|cat|dog|fertilizer|fertiliser|humidity|temperature|compost|calendar|schedule|after|before|today|tomorrow|daily|weekly|often|weather|these|those|other)\b/;

export function findPlantNameReview(transcript: string, vocabulary: string[]): PlantNameReview | null {
  // The ASR hint budget must not make a correctly spoken catalog name unknown.
  const seen = new Set<string>();
  const terms = [...normalizeVoiceVocabulary(vocabulary, 5000), ...commonNames, ...plantSpeciesVocabulary()]
    .map(term => ({ term, key: normalize(term) }))
    .filter(({ key }) => { if (seen.has(key)) return false; seen.add(key); return true; });
  const words = Array.from(transcript.matchAll(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu));
  const nameMarker = /^(?:my|our|the|water|watering|grow|repot|prune|about|named|called|is|does)$/i;
  for (let index = 0; index < words.length; index++) {
    const marker = index ? words[index - 1][0] : '';
    if (!(index === 0 && words.length <= 3) && !nameMarker.test(marker)) continue;
    if (/^(?:my|our|the|a|an|it|its|this|that|and|what|how|does|is|should)$/i.test(words[index][0])) continue;
    const start = words[index].index!;
    const spans = [];
    for (let size = 1; size <= 5 && index + size <= words.length; size++) {
      const last = words[index + size - 1];
      let end = last.index! + last[0].length;
      if (/(?:['’]s)$/i.test(last[0])) end -= 2;
      const heard = transcript.slice(start, end);
      // Never let a name span cross punctuation into the next phrase.
      if (/[?.!,]/.test(heard)) break;
      spans.push({ start, end, heard, key: normalize(heard), size });
    }
    if (spans.some(span => terms.some(term => term.key === span.key || `${term.key}s` === span.key))) continue;
    const matches = spans.filter(span => span.key.length >= 4 && !genericSubject.test(span.key))
      .flatMap(span => terms.filter(term => term.key.length >= 4 && Math.abs(term.key.length - span.key.length) <= 2 && term.key.split(' ').length === span.key.split(' ').length)
        .map(term => ({ ...span, term: term.term, distance: editDistance(span.key, term.key) }))
        .filter(term => term.distance <= (Math.min(span.key.length, normalize(term.term).length) >= 8 ? 2 : 1)))
      .sort((a, b) => b.size - a.size || a.distance - b.distance || a.term.localeCompare(b.term));
    if (matches.length) {
      const best = matches[0];
      return { transcript, heard: best.heard, start, end: best.end,
        suggestions: matches.filter(match => match.end === best.end).slice(0, 4).map(match => match.term) };
    }
    const first = spans[0];
    const explicitName = /^(?:named|called)$/i.test(marker);
    // An arbitrary unknown subject or adjective is not evidence of a plant name.
    if (first.key.length >= 4 && !genericSubject.test(first.key) && explicitName) {
      return { transcript, heard: first.heard, start, end: first.end, suggestions: [] };
    }
  }
  return null;
}

export function applyPlantNameSuggestion(review: PlantNameReview, name: string): string | null {
  if (!review.suggestions.includes(name)) return null;
  return review.transcript.slice(0, review.start) + name + review.transcript.slice(review.end);
}
