export type SubscriptionTier = 'free' | 'pro' | 'mega-pro';

export interface SubscriptionLimits {
  maxAccounts: number;
  maxPostsPerScrape: number;
  minScrapeInterval: 'daily' | '6h' | '3h' | '1h'; // Most frequent allowed
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
};

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  isActive: boolean;
  expiresAt?: string; // ISO date string
  stripeSubscriptionId?: string;
}
