// Bright Data dataset configurations for all 6 supported platforms
// Each platform maps to its specific dataset with on-demand or recurring support

export type PlatformId = 'x' | 'reddit' | 'linkedin' | 'facebook' | 'instagram' | 'tiktok';

export interface PlatformDataset {
  id: string;
  name: string;
  urlTemplate: string;
  supportsOnDemand: boolean;  // Can trigger via /trigger API
  supportsRecurring: boolean; // Needs DCA collector (dashboard config)
  refreshInterval: number;    // Minimum refresh interval in ms
  /**
   * Set when the platform is collected by a Scraper Studio scraper (c_…)
   * instead of a marketplace dataset. X has no dataset that accepts a profile
   * URL, so its timeline comes from a scraper we created through the API.
   */
  scraperId?: string;
}

export const BRIGHTDATA_DATASETS: Record<Exclude<PlatformId, 'reddit'>, PlatformDataset> = {
  instagram: {
    id: 'gd_l1vikfch901nx3by4',
    name: 'Instagram - Profiles',
    urlTemplate: 'https://www.instagram.com/{username}/',
    supportsOnDemand: true,
    supportsRecurring: true,
    refreshInterval: 60 * 60 * 1000, // 1 hour
  },
  linkedin: {
    id: 'gd_l1viktl72bvl7bjuj0',
    name: 'LinkedIn people profiles',
    urlTemplate: 'https://www.linkedin.com/in/{username}/',
    supportsOnDemand: true,
    supportsRecurring: true,
    refreshInterval: 60 * 60 * 1000,
  },
  tiktok: {
    id: 'gd_l1villgoiiidt09ci',
    name: 'TikTok - Profiles',
    urlTemplate: 'https://www.tiktok.com/@{username}',
    supportsOnDemand: true,
    supportsRecurring: true,
    refreshInterval: 60 * 60 * 1000,
  },
  x: {
    // Neither gd_lhqdbl2k1adkkc5tss ("does not support collection") nor the
    // X posts dataset gd_lwxkxvnf1cynvib9co (status URLs only) accepts a
    // profile URL, so timelines come from a Scraper Studio scraper created
    // through POST /dca/collector + the AI automate_template flow.
    id: 'c_mumyczdc14w602ck3i',
    name: 'X profile posts (Scraper Studio)',
    urlTemplate: 'https://x.com/{username}',
    supportsOnDemand: true,
    supportsRecurring: false,
    refreshInterval: 60 * 60 * 1000,
    scraperId: 'c_mumyczdc14w602ck3i',
  },
  facebook: {
    // "Facebook companies profile" (gd_lfqk7jkk2582box2zn) rejects /trigger —
    // this one accepts a page URL and returns its posts on demand.
    id: 'gd_lkaxegm826bjpoo9m5',
    name: 'Facebook page posts',
    urlTemplate: 'https://www.facebook.com/{username}/',
    supportsOnDemand: true,
    supportsRecurring: true,
    refreshInterval: 60 * 60 * 1000, // 1 hour
  },
};

export function getDatasetForPlatform(platform: PlatformId): PlatformDataset | undefined {
  if (platform === 'reddit') return undefined; // No Bright Data dataset
  return BRIGHTDATA_DATASETS[platform];
}

export function supportsPlatform(platform: PlatformId): boolean {
  return platform !== 'reddit';
}
