const LIFEWOOD = /(?:^|[^\p{L}\p{N}])life[\s-]*wood(?=$|[^\p{L}\p{N}])/iu;

export function heardLifewood(transcript: string): boolean {
  return LIFEWOOD.test(transcript);
}
