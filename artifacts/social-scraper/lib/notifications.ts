import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { PlatformId, Post } from '@/types';
import { PLATFORMS } from '@/constants/platforms';

/**
 * Local notifications for "something new landed in the feed".
 *
 * The app can't rely on server push (the backend only collects), so every time
 * a fetch discovers posts the feed has never seen we raise one notification
 * per platform — e.g. title `Instagram · New post from nasa`.
 */

const SNIPPET_LENGTH = 120;
let handlerInstalled = false;

/** Show notifications while the app is open too, not just when it is closed. */
function installHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Ask once for permission; returns false when the user said no (or can't be asked again). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  installHandler();
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

function snippet(text?: string): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > SNIPPET_LENGTH ? `${clean.slice(0, SNIPPET_LENGTH - 1)}…` : clean;
}

function authorOf(post: Post): string {
  return (post.authorHandle || post.author || post.sourceLabel || '').replace(/^@/, '');
}

/**
 * Notify about posts a fetch just discovered, grouped per platform so the
 * platform is always in the title: `X · 3 new posts from nasa, spacex`.
 */
export async function notifyNewPosts(newPosts: Post[]): Promise<void> {
  if (newPosts.length === 0 || Platform.OS === 'web') return;
  if (!(await ensureNotificationPermission())) return;

  const byPlatform = new Map<PlatformId, Post[]>();
  for (const post of newPosts) {
    const bucket = byPlatform.get(post.platform);
    if (bucket) bucket.push(post);
    else byPlatform.set(post.platform, [post]);
  }

  try {
    for (const [platform, posts] of byPlatform) {
      const name = PLATFORMS[platform]?.name ?? platform;
      const authors = Array.from(new Set(posts.map(authorOf).filter(Boolean)));
      const from =
        authors.length > 0
          ? ` from ${authors.slice(0, 2).join(', ')}${authors.length > 2 ? ` +${authors.length - 2}` : ''}`
          : '';
      const title =
        posts.length === 1 ? `${name} · New post${from}` : `${name} · ${posts.length} new posts${from}`;
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body: snippet(posts[0].content) || 'Open the feed to see it.',
          data: { platform },
        },
        trigger: null, // deliver now
      });
    }
  } catch {
    // Notifications are best-effort — a failure here must never break a fetch.
  }
}

/** Open the Feed when the user taps one of those notifications. */
export function onNotificationOpened(onOpen?: () => void): { remove: () => void } {
  installHandler();
  return Notifications.addNotificationResponseReceivedListener(() => {
    try {
      router.navigate('/');
    } catch {
      /* router not ready yet */
    }
    onOpen?.();
  });
}
