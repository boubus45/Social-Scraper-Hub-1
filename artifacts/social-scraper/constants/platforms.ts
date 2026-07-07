import { PlatformDef, PlatformId } from '@/types';

export const PLATFORMS: Record<PlatformId, PlatformDef> = {
  x: {
    id: 'x',
    name: 'X',
    color: '#FFFFFF',
    bgColor: '#000000',
    charLimit: 280,
    hasApi: true,
    icon: 'twitter',
    description: 'Post to X / Twitter using Bearer Token credentials.',
    appScheme: 'twitter://',
    webUrl: 'https://x.com',
  },
  reddit: {
    id: 'reddit',
    name: 'Reddit',
    color: '#FFFFFF',
    bgColor: '#FF4500',
    charLimit: 40000,
    hasApi: true,
    icon: 'message-circle',
    description: 'Fetch from subreddits or user profiles. Post via Reddit API.',
    webUrl: 'https://reddit.com',
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#FFFFFF',
    bgColor: '#0A66C2',
    charLimit: 3000,
    hasApi: false,
    icon: 'linkedin',
    description: 'Manual posting via the LinkedIn app.',
    appScheme: 'linkedin://',
    webUrl: 'https://linkedin.com',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    color: '#FFFFFF',
    bgColor: '#1877F2',
    charLimit: 63206,
    hasApi: false,
    icon: 'facebook',
    description: 'Manual posting via the Facebook app.',
    appScheme: 'fb://',
    webUrl: 'https://facebook.com',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    color: '#FFFFFF',
    bgColor: '#E1306C',
    charLimit: 2200,
    hasApi: false,
    icon: 'instagram',
    description: 'Manual posting via the Instagram app.',
    appScheme: 'instagram://',
    webUrl: 'https://instagram.com',
  },
};

export const PLATFORM_LIST: PlatformDef[] = Object.values(PLATFORMS);

export const ALL_PLATFORM_IDS: PlatformId[] = ['x', 'reddit', 'linkedin', 'facebook', 'instagram'];
