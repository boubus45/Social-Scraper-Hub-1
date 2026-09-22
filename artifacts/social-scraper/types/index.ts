export type PlatformId = 'x' | 'reddit' | 'linkedin' | 'facebook' | 'instagram' | 'tiktok';

export interface PlatformDef {
  id: PlatformId;
  name: string;
  color: string;
  bgColor: string;
  charLimit: number;
  hasApi: boolean;
  icon: string;
  description: string;
  appScheme?: string;
  webUrl?: string;
}

export interface PlatformCredentials {
  bearerToken?: string;
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accessTokenSecret?: string;
  clientId?: string;
  clientSecret?: string;
  cookies?: string;
  username?: string;
  password?: string;
}

export interface PlatformSettings {
  fetchEnabled: boolean;
  postEnabled: boolean;
  useApi: boolean; // true = use API/HTTP, false = copy-paste/open-app manual mode
  credentials: PlatformCredentials;
  followedAccounts: string[];
}

export interface Profile {
  name: string;
  handle: string;
  bio: string;
  avatarUri?: string;
}

export type AIProvider = 'openai' | 'anthropic' | 'gemini';

export const AI_MODELS: Record<AIProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
  gemini: ['gemini-1.5-pro', 'gemini-1.5-flash'],
};

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
};

export interface AISettings {
  provider: AIProvider;
  model: string;
  apiKey: string;
}

export type FetchFrequency = 'manual' | '15min' | '30min' | '1h' | '6h';

export const FETCH_FREQUENCY_LABELS: Record<FetchFrequency, string> = {
  manual: 'Manual only',
  '15min': 'Every 15 minutes',
  '30min': 'Every 30 minutes',
  '1h': 'Every hour',
  '6h': 'Every 6 hours',
};

export interface AppSettings {
  profile: Profile;
  ai: AISettings;
  platforms: Record<PlatformId, PlatformSettings>;
  fetchFrequency: FetchFrequency;
}

export interface Post {
  id: string;
  platform: PlatformId;
  author: string;
  authorHandle: string;
  authorAvatar?: string;
  content: string;
  timestamp: string;
  url: string;
  likes?: number;
  reposts?: number;
  comments?: number;
  /** Image / video URLs extracted from the original post */
  media?: string[];
  mediaItems?: Array<{ type: 'image' | 'video'; url: string }>;
  /** Configured source that produced this post, e.g. r/unsloth or u/example */
  sourceKey?: string;
  sourceLabel?: string;
  sourceKind?: 'subreddit' | 'user' | 'account';
  /** True when a subreddit post was authored by the configured subreddit account. */
  isOfficial?: boolean;
  /** True only for posts discovered during the most recent successful fetch. */
  isNew?: boolean;
  fetchedAt?: string;
  fetchBatchId?: string;
}

export interface PlatformDraft {
  content: string;
  edited: boolean;
}

export interface ComposedPost {
  id: string;
  originalPost?: Post;
  baseContent: string;
  drafts: Partial<Record<PlatformId, PlatformDraft>>;
  selectedPlatforms: PlatformId[];
  aiRephrased: boolean;
  /** Media URLs to attach to the published post */
  media: string[];
}

export interface Draft {
  id: string;
  composedPost: ComposedPost;
  savedAt: string;        // ISO timestamp when saved
  scheduledAt?: string;   // ISO timestamp if scheduled for future posting
  redditTarget?: string;  // Subreddit slug to post to (e.g. "programming" or "u_myuser")
  postResults?: Record<string, { ok: boolean; url?: string; error?: string }>; // per-platform outcome
}

export type AITone = 'professional' | 'casual' | 'concise' | 'expanded' | 'engaging';

export const AI_TONE_LABELS: Record<AITone, string> = {
  professional: 'Professional',
  casual: 'Casual',
  concise: 'Concise',
  expanded: 'Expanded',
  engaging: 'Engaging',
};
