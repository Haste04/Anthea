const SIX_SEVEN = /(?:^|[^\p{L}\p{N}])(?:six[\s,.-]+seven|6[\s,-]+7|67)(?=$|[^\p{L}\p{N}])/iu;

export function heardSixSeven(transcript: string): boolean {
  return SIX_SEVEN.test(transcript);
}
