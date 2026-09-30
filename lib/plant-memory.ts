import type { Chat, Message, Plant } from './workspace-data';

export type PlantResolution = {
  kind: 'linked' | 'named' | 'none' | 'ambiguous';
  plant: Plant | null;
  ambiguousNames: string[];
};

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function resolveConversationPlant(plants: Plant[], linkedPlantId: string | undefined, utterance: string): PlantResolution {
  const linked = plants.find(plant => plant.id === linkedPlantId);
  const normalizedUtterance = ` ${normalizeName(utterance)} `;
  const matches = plants.filter(plant => {
    const name = normalizeName(plant.name);
    return name.length > 0 && normalizedUtterance.includes(` ${name} `);
  });
  if (linked && matches.some(plant => plant.id === linked.id)) return { kind: 'linked', plant: linked, ambiguousNames: [] };
  if (matches.length === 1) return { kind: 'named', plant: matches[0], ambiguousNames: [] };
  if (matches.length > 1) {
    const mostSpecific = matches.filter(plant => {
      const name = normalizeName(plant.name);
      return !matches.some(other => other.id !== plant.id && normalizeName(other.name).includes(` ${name} `));
    });
    if (mostSpecific.length === 1) return { kind: 'named', plant: mostSpecific[0], ambiguousNames: [] };
    return { kind: 'ambiguous', plant: null, ambiguousNames: mostSpecific.map(plant => plant.name) };
  }
  if (linked) return { kind: 'linked', plant: linked, ambiguousNames: [] };
  return { kind: 'none', plant: null, ambiguousNames: [] };
}

function successfulExchanges(chat: Chat, plantId: string) {
  const exchanges: { question: Message; answer: Message; updatedAt: number }[] = [];
  for (let index = 0; index + 1 < chat.messages.length; index++) {
    const question = chat.messages[index];
    const answer = chat.messages[index + 1];
    const questionPlant = question.plantId === undefined ? chat.plantId : question.plantId;
    const answerPlant = answer.plantId === undefined ? chat.plantId : answer.plantId;
    if (question.role !== 'user' || answer.role !== 'assistant' || answer.pending || answer.error || answer.reminderProposal || questionPlant !== plantId || answerPlant !== plantId || !question.text.trim() || !answer.text.trim()) continue;
    exchanges.push({ question, answer, updatedAt: answer.createdAt ?? chat.updatedAt });
    index++;
  }
  return exchanges;
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function buildPlantMemory(plant: Plant, chats: Chat[], currentChatId: string, maxChars = 2400): string {
  const limit = Math.max(300, Math.min(6000, Math.floor(maxChars)));
  const details = [
    `Saved plant name: ${plant.name}`,
    plant.species && `User-recorded species: ${plant.species}`,
    plant.location && `User-recorded location: ${plant.location}`,
    plant.notes && `User care notes: ${plant.notes.slice(0, 700)}`,
  ].filter((value): value is string => Boolean(value));
  let memory = details.join('\n').slice(0, Math.min(900, limit - 300));
  const exchanges = chats
    .filter(chat => chat.id !== currentChatId && chat.plantId === plant.id)
    .flatMap(chat => successfulExchanges(chat, plant.id))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 4);

  for (const exchange of exchanges) {
    const date = exchange.answer.createdAt ? new Date(exchange.answer.createdAt).toLocaleDateString() : 'date not recorded';
    const prefix = `\nEarlier conversation (${date}) — user: `;
    const middle = '\nCactea: ';
    const suffix = '\n';
    const available = limit - memory.length - prefix.length - middle.length - suffix.length;
    if (available <= 40) break;
    const questionBudget = Math.min(500, Math.ceil(available * 0.35));
    const answerBudget = available - questionBudget;
    const entry = `${prefix}${clean(exchange.question.text).slice(0, questionBudget)}${middle}${clean(exchange.answer.text).slice(0, answerBudget)}${suffix}`;
    memory += entry;
  }
  return memory;
}
