import { PlatformId } from './index';

export interface MonitoredAccount {
  id: string; // UUID
  platform: PlatformId;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isActive: boolean;
  lastScrapedAt?: string; // ISO date
  lastScrapedPostIds?: string[]; // For deduplication
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

export interface ScraperConfig {
  accountId: string;
  maxPostsPerScrape: number;
  scrapeInterval: 'daily' | '6h' | '3h' | '1h';
  lastRunAt?: string;
  nextScheduledRunAt?: string;
}

export interface ScrapedPost {
  id: string; // Platform post ID
  platform: PlatformId;
  accountId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  content: string;
  url: string;
  publishedAt: string; // ISO date
  media: ScrapedMedia[];
  metrics: {
    likes: number;
    comments: number;
    shares: number;
    views?: number;
  };
  isNew: boolean; // True if new since last scrape
  scrapedAt: string; // ISO date
}

export interface ScrapedMedia {
  url: string;
  type: 'image' | 'video' | 'carousel';
  alt?: string;
}

export interface ApifyWebhookPayload {
  resourceId: string; // Actor task/run ID
  resourceType: 'actor' | 'task';
  eventType: 'ACTOR.RUN.SUCCEEDED' | 'ACTOR.RUN.FAILED' | 'ACTOR.RUN.ABORTED';
  data: {
    runId: string;
    actorId: string;
    actorTaskId?: string;
    actorRunUrl: string;
    status: 'SUCCEEDED' | 'FAILED' | 'ABORTED';
    meta: {
      origin: string;
      clientIp: string;
      userAgent: string;
    };
  };
}
