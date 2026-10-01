# Scientific-name lookup

The My Plants form checks a local list while the user types. A single complete
name or alias fills an empty scientific-name field. Monstera and Swiss cheese
plant offer two choices rather than assigning one species. Nicknames and partial
words do not automatically identify plants. Existing saved species and manual
edits are preserved; an automatic value is replaced or cleared as the name changes.

The local list contains 50 entries covering houseplants, herbs, vegetables, and
flowers. Common Sunflower now fills locally. Mint, pothos, fern, and money plant
offer choices among the matching entries. Scientific names and the aliases in
`lib/plant-species.ts` also work.
Names are lookup suggestions, not identification from a photo or plant examination.

Sources for the common/scientific-name mappings:

- [RHS Swiss cheese plants](https://www.rhs.org.uk/plants/swiss-cheese-plants/how-to-grow-swiss-cheese-plants)
- [RHS spider plant](https://www.rhs.org.uk/plants/3761/chlorophytum-comosum-spider-plant-ribbon-plant/details)
- [Kew snake plant](https://www.kew.org/plants/snake-plant)
- NC State Extension: [ZZ plant](https://plants.ces.ncsu.edu/plants/zamioculcas-zamiifolia/), [golden pothos](https://plants.ces.ncsu.edu/plants/epipremnum-aureum/), [rubber plant](https://plants.ces.ncsu.edu/plants/ficus-elastica/), [fiddle-leaf fig](https://plants.ces.ncsu.edu/plants/ficus-lyrata/), [jade plant](https://plants.ces.ncsu.edu/plants/crassula-ovata/).

## Current local list

| Plant | Scientific name | Reference |
| --- | --- | --- |
| Swiss cheese plant | *Monstera deliciosa* | [Source](https://www.rhs.org.uk/plants/swiss-cheese-plants/how-to-grow-swiss-cheese-plants) |
| Swiss cheese vine | *Monstera adansonii* | [Source](https://www.rhs.org.uk/plants/swiss-cheese-plants/how-to-grow-swiss-cheese-plants) |
| Spider plant | *Chlorophytum comosum* | [Source](https://www.rhs.org.uk/plants/3761/chlorophytum-comosum-spider-plant-ribbon-plant/details) |
| Snake plant | *Dracaena trifasciata* | [Source](https://www.kew.org/plants/snake-plant) |
| ZZ plant | *Zamioculcas zamiifolia* | [Source](https://plants.ces.ncsu.edu/plants/zamioculcas-zamiifolia/) |
| Golden pothos | *Epipremnum aureum* | [Source](https://plants.ces.ncsu.edu/plants/epipremnum-aureum/) |
| Rubber plant | *Ficus elastica* | [Source](https://plants.ces.ncsu.edu/plants/ficus-elastica/) |
| Fiddle-leaf fig | *Ficus lyrata* | [Source](https://plants.ces.ncsu.edu/plants/ficus-lyrata/) |
| Jade plant | *Crassula ovata* | [Source](https://plants.ces.ncsu.edu/plants/crassula-ovata/) |
| Common sunflower | *Helianthus annuus* | [Source](https://plants.ces.ncsu.edu/plants/helianthus-annuus/) |
| Aloe vera | *Aloe vera* | [Source](https://plants.ces.ncsu.edu/plants/aloe-vera/) |
| Peace lily | *Spathiphyllum wallisii* | [Source](https://www.rhs.org.uk/plants/peace-lilies) |
| Heartleaf philodendron | *Philodendron hederaceum* | [Source](https://plants.ces.ncsu.edu/plants/philodendron-hederaceum/) |
| Satin pothos | *Scindapsus pictus* | [Source](https://plants.ces.ncsu.edu/plants/scindapsus-pictus/) |
| Chinese money plant | *Pilea peperomioides* | [Source](https://plants.ces.ncsu.edu/plants/pilea-peperomioides/) |
| Money tree | *Pachira aquatica* | [Source](https://plants.ces.ncsu.edu/plants/pachira-aquatica/) |
| Boston fern | *Nephrolepis exaltata* | [Source](https://plants.ces.ncsu.edu/plants/nephrolepis-exaltata/) |
| Bird's nest fern | *Asplenium nidus* | [Source](https://plants.ces.ncsu.edu/plants/asplenium-nidus/) |
| Maidenhair fern | *Adiantum raddianum* | [Source](https://plants.ces.ncsu.edu/plants/adiantum-raddianum/) |
| Flamingo flower | *Anthurium andraeanum* | [Source](https://plants.ces.ncsu.edu/plants/anthurium-andraeanum/) |
| Prayer plant | *Maranta leuconeura* | [Source](https://plants.ces.ncsu.edu/plants/maranta-leuconeura/) |
| Cast iron plant | *Aspidistra elatior* | [Source](https://plants.ces.ncsu.edu/plants/aspidistra-elatior/) |
| Philippine evergreen | *Aglaonema commutatum* | [Source](https://www.chicagobotanic.org/plant-information/plant-finder/aglaonema-commutatum-chinese-evergreen) |
| Dumb cane | *Dieffenbachia seguine* | [Source](https://plants.ces.ncsu.edu/plants/dieffenbachia-seguine/) |
| Arrowhead plant | *Syngonium podophyllum* | [Source](https://plants.ces.ncsu.edu/plants/syngonium-podophyllum/) |
| Ponytail palm | *Beaucarnea recurvata* | [Source](https://plants.ces.ncsu.edu/plants/beaucarnea-recurvata/) |
| Parlor palm | *Chamaedorea elegans* | [Source](https://plants.ces.ncsu.edu/plants/chamaedorea-elegans/) |
| Kentia palm | *Howea forsteriana* | [Source](https://plants.ces.ncsu.edu/plants/howea-forsteriana/) |
| English ivy | *Hedera helix* | [Source](https://plants.ces.ncsu.edu/plants/hedera-helix/) |
| Wax plant | *Hoya carnosa* | [Source](https://plants.ces.ncsu.edu/plants/hoya-carnosa/) |
| String of pearls | *Curio rowleyanus* | [Source](https://plants.ces.ncsu.edu/plants/curio-rowleyanus/) |
| Thanksgiving cactus | *Schlumbergera truncata* | [Source](https://plants.ces.ncsu.edu/plants/schlumbergera-truncata/) |
| Florist kalanchoe | *Kalanchoe blossfeldiana* | [Source](https://plants.ces.ncsu.edu/plants/kalanchoe-blossfeldiana/) |
| Mexican snowball | *Echeveria elegans* | [Source](https://plants.ces.ncsu.edu/plants/echeveria-elegans/) |
| Zebra haworthia | *Haworthiopsis attenuata* | [Source](https://plants.ces.ncsu.edu/plants/haworthiopsis-attenuata/) |
| Burro's tail | *Sedum morganianum* | [Source](https://plants.ces.ncsu.edu/plants/sedum-morganianum/) |
| Garden croton | *Codiaeum variegatum* | [Source](https://plants.ces.ncsu.edu/plants/codiaeum-variegatum/) |
| Coleus | *Coleus scutellarioides* | [Source](https://plants.ces.ncsu.edu/plants/coleus-scutellarioides/) |
| Sweet basil | *Ocimum basilicum* | [Source](https://plants.ces.ncsu.edu/plants/ocimum-basilicum/) |
| Spearmint | *Mentha spicata* | [Source](https://plants.ces.ncsu.edu/plants/mentha-spicata/) |
| Peppermint | *Mentha x piperita* | [Source](https://plants.ces.ncsu.edu/plants/mentha-x-piperita/) |
| Rosemary | *Salvia rosmarinus* | [Source](https://plants.ces.ncsu.edu/plants/salvia-rosmarinus/) |
| Common thyme | *Thymus vulgaris* | [Source](https://plants.ces.ncsu.edu/plants/thymus-vulgaris/) |
| English lavender | *Lavandula angustifolia* | [Source](https://plants.ces.ncsu.edu/plants/lavandula-angustifolia/) |
| Coriander | *Coriandrum sativum* | [Source](https://plants.ces.ncsu.edu/plants/coriandrum-sativum/) |
| Parsley | *Petroselinum crispum* | [Source](https://plants.ces.ncsu.edu/plants/petroselinum-crispum/) |
| Tomato | *Solanum lycopersicum* | [Source](https://plants.ces.ncsu.edu/plants/solanum-lycopersicum/) |
| Chili pepper | *Capsicum annuum* | [Source](https://plants.ces.ncsu.edu/plants/capsicum-annuum/) |
| Cucumber | *Cucumis sativus* | [Source](https://plants.ces.ncsu.edu/plants/cucumis-sativus/) |
| Common zinnia | *Zinnia elegans* | [Source](https://plants.ces.ncsu.edu/plants/zinnia-elegans/) |

For names outside the list, **Look up species** makes an explicit request to
`GET /api/species?q=...`. The server uses the existing `PERENUAL_API_KEY` and
returns up to ten distinct scientific names. A single result fills an empty
field; multiple results require a choice. Users can always type their own species.

Typing does not call Perenual or Gemini. Completed fallback results are cached
for up to one day in browser memory, and Next.js caches provider fetches for one
day. No AI tokens are used. An uncached fallback consumes Perenual quota. Server
cache persistence depends on the host. Lookups have their own limit of ten
requests per IP per minute and use the existing production Upstash configuration.
Changing names, editing species, or closing the form cancels the pending lookup
and prevents its result from changing the draft. Provider errors do not prevent
saving a plant with a blank or manually entered species.
