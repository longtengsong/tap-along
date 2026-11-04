export type SearchSourceTier =
  | 'official'
  | 'reference'
  | 'news'
  | 'general'
  | 'ugc';

export interface WebSearchItem {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  publishedAt?: string;
  tier: SearchSourceTier;
  score: number;
}

const OFFICIAL_SUFFIXES = ['.gov', '.edu', '.int', '.mil'];
const OFFICIAL_DOMAINS = [
  'who.int',
  'un.org',
  'iso.org',
  'ietf.org',
  'rfc-editor.org',
  'w3.org',
  'developer.mozilla.org',
];
const REFERENCE_DOMAINS = [
  'wikipedia.org',
  'britannica.com',
  'nature.com',
  'science.org',
  'sciencedirect.com',
  'springer.com',
  'acm.org',
  'ieee.org',
];
const NEWS_DOMAINS = [
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'bbc.co.uk',
  'nytimes.com',
  'wsj.com',
  'ft.com',
  'xinhuanet.com',
  'news.cn',
  'people.com.cn',
  'theguardian.com',
];
const UGC_DOMAINS = [
  'zhihu.com',
  'weibo.com',
  'x.com',
  'twitter.com',
  'facebook.com',
  'reddit.com',
  'quora.com',
  'medium.com',
  'substack.com',
  'bilibili.com',
  'douban.com',
  'tieba.baidu.com',
];

const matchesDomain = (domain: string, allowed: string[]) =>
  allowed.some((item) => domain === item || domain.endsWith(`.${item}`));

export const normalizeHttpUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value);

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password
    ) {
      return null;
    }

    url.hash = '';

    const keys = Array.from(url.searchParams.keys());

    for (const key of keys) {
      if (key.toLowerCase().startsWith('utm_')) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return null;
  }
};

export const domainFromUrl = (value: string): string | null => {
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    const host = url.hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
};

export const classifyDomain = (domain: string): SearchSourceTier => {
  const normalized = domain.toLowerCase();

  if (
    OFFICIAL_SUFFIXES.some((suffix) => normalized.endsWith(suffix)) ||
    matchesDomain(normalized, OFFICIAL_DOMAINS)
  ) {
    return 'official';
  }

  if (matchesDomain(normalized, REFERENCE_DOMAINS)) {
    return 'reference';
  }

  if (matchesDomain(normalized, NEWS_DOMAINS)) {
    return 'news';
  }

  if (matchesDomain(normalized, UGC_DOMAINS)) {
    return 'ugc';
  }

  return 'general';
};

const TIER_WEIGHT: Record<SearchSourceTier, number> = {
  official: 40,
  reference: 30,
  news: 20,
  general: 10,
  ugc: 0,
};

export const rankSearchItems = (items: WebSearchItem[]): WebSearchItem[] =>
  [...items].sort((left, right) => {
    const tierDelta = TIER_WEIGHT[right.tier] - TIER_WEIGHT[left.tier];

    if (tierDelta !== 0) {
      return tierDelta;
    }

    return right.score - left.score;
  });

export const isEvidenceSufficient = (items: WebSearchItem[]): boolean =>
  items.some(
    (item) =>
      item.tier === 'official' ||
      item.tier === 'reference' ||
      item.tier === 'news',
  );
