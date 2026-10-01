import { enforceApiLimit, rateLimitResponse } from '@/lib/api-guard';
import { searchSpeciesOptions } from '@/lib/perenual';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2 || query.length > 120) {
    return Response.json({ error: 'Enter a plant name between 2 and 120 characters.' }, { status: 400 });
  }
  const limit = await enforceApiLimit(request, 'species');
  if (!limit.allowed) return rateLimitResponse(limit);
  try {
    const matches = await searchSpeciesOptions(query.toLowerCase().replace(/\s+/g, ' '));
    return Response.json({ matches });
  } catch {
    return Response.json({ error: 'Species lookup is unavailable. You can enter the scientific name manually or try again later.' }, { status: 503 });
  }
}
