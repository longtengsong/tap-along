import type { ResearchEvidence, TeacherSource } from '../../shared/search.ts';

export interface CitationResult {
  reply: string;
  sources: TeacherSource[];
  citationStatus: 'cited' | 'uncited';
}

export const sanitizeCitations = (
  reply: string,
  evidence: ResearchEvidence[],
): CitationResult => {
  const sources = evidence.map((item) => item.source);
  const validIndexes = new Set(sources.map((source) => source.index));
  let cited = false;
  const sanitized = reply.replace(/\[(\d{1,2})\]/g, (marker, value: string) => {
    const index = Number(value);

    if (!validIndexes.has(index)) {
      return '';
    }

    cited = true;
    return marker;
  });

  return {
    reply: sanitized,
    sources,
    citationStatus: cited ? 'cited' : 'uncited',
  };
};
