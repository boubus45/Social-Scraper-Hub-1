export type SubscriptionTier = 'free' | 'pro' | 'mega-pro' | 'admin';

export interface SubscriptionLimits {
  maxAccounts: number;
  maxPostsPerScrape: number;
  /** Most frequent allowed refresh; 'instant' = refresh on every open. */
  minScrapeInterval: 'instant' | 'daily' | '6h' | '3h' | '1h';
  canSchedulePosts: boolean;
}

export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, SubscriptionLimits> = {
  free: {
    maxAccounts: 3,
    maxPostsPerScrape: 2,
    minScrapeInterval: 'daily',
    canSchedulePosts: false,
  },
  pro: {
    maxAccounts: 10,
    maxPostsPerScrape: 10,
    minScrapeInterval: '6h',
    canSchedulePosts: true,
  },
  'mega-pro': {
    maxAccounts: 20,
    maxPostsPerScrape: 20,
    minScrapeInterval: '1h',
    canSchedulePosts: true,
  },
  // Owner account: every account allowed, feed refreshes on every open.
  admin: {
    maxAccounts: Infinity,
    maxPostsPerScrape: 50,
    minScrapeInterval: 'instant',
    canSchedulePosts: true,
  },
};

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  isActive: boolean;
  expiresAt?: string; // ISO date string
  stripeSubscriptionId?: string;
}
