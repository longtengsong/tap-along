import type { RetrievalPage } from '../db/pages.ts';

export interface RelatedNoteCandidate {
  pageId: number;
  title: string;
  source: string;
  /** 旧念头正文；引导判定需要把匹配到的笔记一起交给模型。 */
  body?: string;
  snippet: string;
  score: number;
}

const CJK_RUN = /[\u3400-\u9fff]+/g;
const LATIN_WORD = /[a-z][a-z0-9]{2,}/gi;

const STOPWORDS = new Set([
  '的',
  '了',
  '是',
  '我',
  '你',
  '他',
  '她',
  '它',
  '这',
  '那',
  '一个',
  '我们',
  '你们',
  '他们',
  '可以',
  '因为',
  '所以',
  '但是',
  '如果',
  '就是',
  '不是',
  '没有',
  '什么',
  '怎么',
  '这个',
  '那个',
  '还是',
  '以及',
  '然后',
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'are',
  'was',
  'were',
  'have',
  'has',
  'not',
  'you',
  'your',
]);

const termWeight = (term: string) => (term.length >= 3 ? 2 : 1);

const pushTerm = (terms: Map<string, number>, term: string) => {
  const normalized = term.trim().toLowerCase();

  if (
    !normalized ||
    STOPWORDS.has(normalized) ||
    terms.size >= 60 ||
    terms.has(normalized)
  ) {
    return;
  }

  terms.set(normalized, termWeight(normalized));
};

/**
 * 从正文抽取可比较的词项。
 * 中文用 2/3 字 n-gram，英文取 3 字母以上的单词；这是最小召回，不是分词器。
 */
export const extractTerms = (body: string): Map<string, number> => {
  const terms = new Map<string, number>();

  for (const run of body.match(CJK_RUN) ?? []) {
    for (const size of [2, 3]) {
      for (let index = 0; index + size <= run.length; index += 1) {
        pushTerm(terms, run.slice(index, index + size));
      }
    }
  }

  for (const word of body.match(LATIN_WORD) ?? []) {
    pushTerm(terms, word);
  }

  return terms;
};

const buildSnippet = (body: string, terms: Map<string, number>) => {
  const normalizedBody = body.toLowerCase();
  let firstMatch = -1;

  for (const term of terms.keys()) {
    const index = normalizedBody.indexOf(term);

    if (index >= 0 && (firstMatch < 0 || index < firstMatch)) {
      firstMatch = index;
    }
  }

  if (firstMatch < 0) {
    return body.trim().slice(0, 240);
  }

  const start = Math.max(0, firstMatch - 80);
  const end = Math.min(body.length, firstMatch + 160);
  return body.slice(start, end).trim().slice(0, 240);
};

/**
 * 用最近页 + 词项重叠做一次轻量召回。
 * 输入顺序就是数据库的最近顺序，分数相同时保持这个顺序。
 */
export const findRelatedNotes = (
  current: Pick<RetrievalPage, 'id' | 'body' | 'source'>,
  pages: RetrievalPage[],
  limit = 8,
): RelatedNoteCandidate[] => {
  const terms = extractTerms(current.body);

  if (terms.size === 0 || limit <= 0) {
    return [];
  }

  return pages
    .filter((page) => page.id !== current.id && page.body.trim())
    .map((page) => {
      const body = page.body.toLowerCase();
      let score = 0;

      for (const [term, weight] of terms) {
        if (body.includes(term)) {
          score += weight;
        }
      }

      if (
        score > 0 &&
        current.source.trim() &&
        page.source === current.source
      ) {
        score += 2;
      }

      return {
        pageId: page.id,
        title: page.title,
        source: page.source,
        body: page.body,
        snippet: buildSnippet(page.body, terms),
        score,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
};
