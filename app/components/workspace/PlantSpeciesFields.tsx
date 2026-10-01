'use client';

import { useEffect, useRef, useState } from 'react';
import { localSpeciesMatches, normalizeSpeciesQuery, type SpeciesOption } from '@/lib/plant-species';

const cache = new Map<string, { matches: SpeciesOption[]; expires: number }>();

export default function PlantSpeciesFields({ plant, onChange, children }: {
  plant: { name: string; species: string };
  onChange: (changes: { name?: string; species?: string }) => void;
  children?: React.ReactNode;
}) {
  const automaticSpecies = useRef<string | null>(null);
  const revision = useRef(0);
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [remoteMatches, setRemoteMatches] = useState<SpeciesOption[]>([]);
  const localMatches = localSpeciesMatches(plant.name);
  const choices = localMatches.length ? localMatches : remoteMatches;

  useEffect(() => () => { revision.current++; request.current?.abort(); }, []);

  function stopLookup() {
    revision.current++;
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setNotice('');
    setRemoteMatches([]);
  }

  function changeName(name: string) {
    stopLookup();
    const matches = localSpeciesMatches(name);
    const canFill = !plant.species.trim() || plant.species === automaticSpecies.current;
    if (canFill) {
      const species = matches.length === 1 ? matches[0].scientificName : '';
      automaticSpecies.current = species || null;
      onChange({ name, species });
      if (species) setNotice('Scientific name filled from the local list. You can edit it.');
    } else {
      onChange({ name });
    }
  }

  function chooseSpecies(species: string) {
    stopLookup();
    automaticSpecies.current = species;
    onChange({ species });
    setNotice('Scientific name selected. You can edit it.');
  }

  async function lookup() {
    if (busy || request.current || localMatches.length) return;
    const query = normalizeSpeciesQuery(plant.name);
    if (query.length < 2 || query.length > 120) return;
    const currentRevision = ++revision.current;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setNotice('Looking up the scientific name…');
    try {
      const cached = cache.get(query);
      let matches = cached && cached.expires > Date.now() ? cached.matches : undefined;
      if (!matches) {
        const response = await fetch(`/api/species?q=${encodeURIComponent(query)}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        if (!response.ok) throw new Error('Lookup unavailable');
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object' || !('matches' in body) || !Array.isArray(body.matches) || body.matches.length > 10 ||
          !body.matches.every(item => item && typeof item.commonName === 'string' && typeof item.scientificName === 'string' && item.scientificName.length > 0 && item.scientificName.length <= 120)) {
          throw new Error('Invalid lookup response');
        }
        matches = body.matches as SpeciesOption[];
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        cache.set(query, { matches, expires: Date.now() + 86400000 });
      }
      if (controller.signal.aborted || revision.current !== currentRevision) return;
      setRemoteMatches(matches);
      if (matches.length === 1 && (!plant.species.trim() || plant.species === automaticSpecies.current)) {
        automaticSpecies.current = matches[0].scientificName;
        onChange({ species: matches[0].scientificName });
        setNotice('Scientific name filled from Perenual. Check the match and edit if needed.');
      } else {
        setNotice(matches.length ? 'Choose the species that matches your plant.' : 'No species found. Try a common plant name or enter the scientific name yourself.');
      }
    } catch {
      if (!controller.signal.aborted && revision.current === currentRevision) {
        setNotice('Lookup is unavailable. You can still enter the scientific name yourself and save your plant.');
      }
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }

  return <>
    <label>Name<input name="plant-name" required maxLength={120} autoFocus value={plant.name} placeholder="e.g. Spider plant" onChange={event => changeName(event.target.value)}/></label>
    <div className="ws-form-grid">
      <label>Species, if known<input name="plant-species" maxLength={120} value={plant.species} placeholder="Scientific name" aria-describedby="plant-species-help" onChange={event => {
        stopLookup();
        automaticSpecies.current = null;
        onChange({ species: event.target.value });
      }}/></label>
      {children}
    </div>
    <div className="ws-species-lookup">
      <p id="plant-species-help" className="ws-muted">Common plant names fill from a local list. You can always edit the scientific name.</p>
      {choices.length > 1 || (choices.length === 1 && plant.species !== choices[0].scientificName) ? <div className="ws-species-choices" role="group" aria-label="Suggested scientific names">
        {choices.map(option => <button type="button" className="ws-secondary" key={option.scientificName} title={option.commonName} onClick={() => chooseSpecies(option.scientificName)}>{option.scientificName}</button>)}
      </div> : null}
      {!localMatches.length && plant.name.trim().length >= 2 && <button type="button" className="ws-secondary" disabled={busy} onClick={lookup}>Look up species</button>}
      {!localMatches.length && plant.name.trim().length >= 2 && <p className="ws-muted">Optional: search Perenual when the local list has no match. This uses an API request.</p>}
      <p className="ws-muted" role="status" aria-live="polite">{notice || (localMatches.length > 1 ? 'This name can refer to several species. Choose one or enter your own.' : '')}</p>
    </div>
  </>;
}
