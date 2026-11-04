import type { PageSnapshot } from '../../shared/pages.ts';
import type { ResearchEvidence } from '../../shared/search.ts';
import type { IntentRouter, ResearchRoute } from './intent-router.ts';
import type { WebSearchService } from './web-search.ts';

export interface ResearchCoordinator {
  route(input: {
    page: PageSnapshot;
    userText: string;
    signal: AbortSignal;
  }): Promise<ResearchRoute>;
  search(input: {
    queries: string[];
    signal: AbortSignal;
  }): Promise<ResearchEvidence[]>;
}

export class ResearchService implements ResearchCoordinator {
  private readonly router: Pick<IntentRouter, 'route'>;
  private readonly searchService: Pick<WebSearchService, 'search'>;

  constructor(
    router: Pick<IntentRouter, 'route'>,
    searchService: Pick<WebSearchService, 'search'>,
  ) {
    this.router = router;
    this.searchService = searchService;
  }

  route(input: {
    page: PageSnapshot;
    userText: string;
    signal: AbortSignal;
  }): Promise<ResearchRoute> {
    return this.router.route(input);
  }

  search(input: {
    queries: string[];
    signal: AbortSignal;
  }): Promise<ResearchEvidence[]> {
    return this.searchService.search(input.queries, input.signal);
  }
}
