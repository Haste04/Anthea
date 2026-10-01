export type SpeciesOption = { commonName: string; scientificName: string };

// A curated name lookup, not an identification engine. Shared aliases deliberately
// produce choices. Sources: RHS Swiss cheese/spider plant profiles, Kew's
// snake-plant profile, and NC State Extension's species profiles. Full list and
// source links: docs/plant-species.md.
const catalog: (SpeciesOption & { aliases: string[] })[] = [
  { commonName: 'Swiss cheese plant', scientificName: 'Monstera deliciosa', aliases: ['monstera', 'swiss cheese plant'] },
  { commonName: 'Swiss cheese vine', scientificName: 'Monstera adansonii', aliases: ['monstera', 'swiss cheese plant', 'swiss cheese vine', 'monkey mask'] },
  { commonName: 'Spider plant', scientificName: 'Chlorophytum comosum', aliases: ['spider plant'] },
  { commonName: 'Snake plant', scientificName: 'Dracaena trifasciata', aliases: ['snake plant', "mother-in-law's tongue", 'sansevieria trifasciata'] },
  { commonName: 'ZZ plant', scientificName: 'Zamioculcas zamiifolia', aliases: ['zz plant', 'zanzibar gem'] },
  { commonName: 'Golden pothos', scientificName: 'Epipremnum aureum', aliases: ['golden pothos', 'pothos', "devil's ivy"] },
  { commonName: 'Rubber plant', scientificName: 'Ficus elastica', aliases: ['rubber plant', 'rubber tree'] },
  { commonName: 'Fiddle-leaf fig', scientificName: 'Ficus lyrata', aliases: ['fiddle leaf fig'] },
  { commonName: 'Jade plant', scientificName: 'Crassula ovata', aliases: ['jade plant', 'jade tree', 'money plant'] },
  { commonName: 'Common sunflower', scientificName: 'Helianthus annuus', aliases: ['sunflower', 'common sunflower'] },
  { commonName: 'Aloe vera', scientificName: 'Aloe vera', aliases: ['aloe', 'barbados aloe', 'medicinal aloe', 'aloe barbadensis'] },
  { commonName: 'Peace lily', scientificName: 'Spathiphyllum wallisii', aliases: ['peace lily', 'wallis peace lily'] },
  { commonName: 'Heartleaf philodendron', scientificName: 'Philodendron hederaceum', aliases: ['heartleaf philodendron', 'heart leaf philodendron', 'sweetheart plant'] },
  { commonName: 'Satin pothos', scientificName: 'Scindapsus pictus', aliases: ['satin pothos', 'silver pothos', 'silk pothos', 'pothos'] },
  { commonName: 'Chinese money plant', scientificName: 'Pilea peperomioides', aliases: ['chinese money plant', 'pancake plant', 'ufo plant', 'coin plant', 'money plant'] },
  { commonName: 'Money tree', scientificName: 'Pachira aquatica', aliases: ['money tree', 'guiana chestnut', 'malabar chestnut', 'money plant'] },
  { commonName: 'Boston fern', scientificName: 'Nephrolepis exaltata', aliases: ['boston fern', 'bostonfern', 'fern'] },
  { commonName: "Bird's nest fern", scientificName: 'Asplenium nidus', aliases: ["bird's nest fern", 'birds nest fern', 'nest fern', 'fern'] },
  { commonName: 'Maidenhair fern', scientificName: 'Adiantum raddianum', aliases: ['maidenhair fern', 'delta maidenhair', 'fern'] },
  { commonName: 'Flamingo flower', scientificName: 'Anthurium andraeanum', aliases: ['flamingo flower', 'flamingo lily', 'laceleaf'] },
  { commonName: 'Prayer plant', scientificName: 'Maranta leuconeura', aliases: ['prayer plant', 'red veined prayer plant', 'herringbone plant'] },
  { commonName: 'Cast iron plant', scientificName: 'Aspidistra elatior', aliases: ['cast iron plant', 'barroom plant', 'iron plant'] },
  { commonName: 'Philippine evergreen', scientificName: 'Aglaonema commutatum', aliases: ['philippine evergreen', 'chinese evergreen'] },
  { commonName: 'Dumb cane', scientificName: 'Dieffenbachia seguine', aliases: ['dumb cane', 'dumbcane', 'spotted dumbcane', 'dieffenbachia maculata'] },
  { commonName: 'Arrowhead plant', scientificName: 'Syngonium podophyllum', aliases: ['arrowhead plant', 'arrowhead vine', 'arrow head vine'] },
  { commonName: 'Ponytail palm', scientificName: 'Beaucarnea recurvata', aliases: ['ponytail palm', 'pony tail plant', 'elephant foot tree'] },
  { commonName: 'Parlor palm', scientificName: 'Chamaedorea elegans', aliases: ['parlor palm', 'parlour palm', 'neanthe bella palm'] },
  { commonName: 'Kentia palm', scientificName: 'Howea forsteriana', aliases: ['kentia palm', 'sentry palm', 'paradise palm'] },
  { commonName: 'English ivy', scientificName: 'Hedera helix', aliases: ['english ivy', 'common ivy'] },
  { commonName: 'Wax plant', scientificName: 'Hoya carnosa', aliases: ['wax plant', 'porcelain flower', 'honey plant'] },
  { commonName: 'String of pearls', scientificName: 'Curio rowleyanus', aliases: ['string of pearls', 'string of beads', 'senecio rowleyanus'] },
  { commonName: 'Thanksgiving cactus', scientificName: 'Schlumbergera truncata', aliases: ['thanksgiving cactus', 'crab cactus', 'false christmas cactus'] },
  { commonName: 'Florist kalanchoe', scientificName: 'Kalanchoe blossfeldiana', aliases: ['florist kalanchoe', 'christmas kalanchoe', 'flaming katy'] },
  { commonName: 'Mexican snowball', scientificName: 'Echeveria elegans', aliases: ['mexican snowball', 'mexican snow ball', 'mexican gem'] },
  { commonName: 'Zebra haworthia', scientificName: 'Haworthiopsis attenuata', aliases: ['zebra haworthia', 'haworthia attenuata'] },
  { commonName: "Burro's tail", scientificName: 'Sedum morganianum', aliases: ["burro's tail", "donkey's tail"] },
  { commonName: 'Garden croton', scientificName: 'Codiaeum variegatum', aliases: ['garden croton', 'croton', 'fire croton'] },
  { commonName: 'Coleus', scientificName: 'Coleus scutellarioides', aliases: ['coleus', 'painted nettle', 'plectranthus scutellarioides', 'solenostemon scutellarioides'] },
  { commonName: 'Sweet basil', scientificName: 'Ocimum basilicum', aliases: ['sweet basil', 'basil', 'genovese basil'] },
  { commonName: 'Spearmint', scientificName: 'Mentha spicata', aliases: ['spearmint', 'garden mint', 'mint'] },
  { commonName: 'Peppermint', scientificName: 'Mentha x piperita', aliases: ['peppermint', 'mint', 'mentha × piperita'] },
  { commonName: 'Rosemary', scientificName: 'Salvia rosmarinus', aliases: ['rosemary', 'rosmarinus officinalis'] },
  { commonName: 'Common thyme', scientificName: 'Thymus vulgaris', aliases: ['common thyme', 'thyme', 'garden thyme'] },
  { commonName: 'English lavender', scientificName: 'Lavandula angustifolia', aliases: ['english lavender', 'common lavender', 'lavender'] },
  { commonName: 'Coriander', scientificName: 'Coriandrum sativum', aliases: ['coriander', 'cilantro', 'chinese parsley'] },
  { commonName: 'Parsley', scientificName: 'Petroselinum crispum', aliases: ['parsley', 'curly parsley', 'italian parsley'] },
  { commonName: 'Tomato', scientificName: 'Solanum lycopersicum', aliases: ['tomato', 'tomatoes', 'lycopersicon esculentum'] },
  { commonName: 'Chili pepper', scientificName: 'Capsicum annuum', aliases: ['chili pepper', 'chilli pepper', 'bell pepper', 'sweet pepper', 'cayenne pepper'] },
  { commonName: 'Cucumber', scientificName: 'Cucumis sativus', aliases: ['cucumber', 'garden cucumber', 'gherkin'] },
  { commonName: 'Common zinnia', scientificName: 'Zinnia elegans', aliases: ['common zinnia', 'zinnia'] },
];

export function normalizeSpeciesQuery(name: string): string {
  return name.trim().toLowerCase().replace(/[’']/g, '').replace(/[-\s]+/g, ' ');
}

export function localSpeciesMatches(name: string): SpeciesOption[] {
  const query = normalizeSpeciesQuery(name);
  if (!query) return [];
  return catalog.filter(item => [item.commonName, item.scientificName, ...item.aliases]
    .some(alias => normalizeSpeciesQuery(alias) === query))
    .map(({ commonName, scientificName }) => ({ commonName, scientificName }));
}
