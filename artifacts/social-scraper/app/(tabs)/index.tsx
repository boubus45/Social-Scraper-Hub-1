import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import PostCard from '@/components/PostCard';
import PlatformBadge from '@/components/PlatformBadge';
import { HeaderLogo } from '@/components/HeaderLogo';
import { HeaderAvatar } from '@/components/HeaderAvatar';
import { PlatformId, Post } from '@/types';
import { PLATFORM_LIST } from '@/constants/platforms';

/**
 * `new` (the default) shows only what the last fetch brought in, grouped by
 * platform — so you never scroll through one platform's archive to reach the
 * other platforms' fresh posts. Platforms with nothing new are left out.
 * `all` keeps the original "everything, separated by platform" view.
 */
type FilterId = 'new' | 'all' | PlatformId;
type FeedItem =
  | { kind: 'platform'; key: string; label: string; platform: PlatformId }
  | { kind: 'source'; key: string; label: string; platform: PlatformId }
  | { kind: 'category'; key: string; label: string; official: boolean }
  | { kind: 'post'; key: string; post: Post };

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { posts, isFetchingPosts, lastFetchError, startCompose, settings } = useApp();
  const [activeFilter, setActiveFilter] = useState<FilterId>('new');
  const [errorCopied, setErrorCopied] = useState(false);
  const visibleKeysRef = useRef(new Set<string>());

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const next = new Set(viewableItems.map(v => v.key as string));
    visibleKeysRef.current = next;
  }).current;

  const enabledPlatforms = PLATFORM_LIST.filter(p => settings.platforms[p.id].fetchEnabled);
  const newCount = posts.filter(post => post.isNew).length;
  const filtered =
    activeFilter === 'new'
      ? posts.filter(post => post.isNew)
      : activeFilter === 'all'
        ? posts
        : posts.filter(post => post.platform === activeFilter);

  // Newest post of a platform inside the current view; used to order the
  // sections so the freshest platform is never below someone's scroll.
  const newestIn = (platform: PlatformId): number =>
    filtered.reduce<number>((latest, post) => {
      if (post.platform !== platform) return latest;
      const time = new Date(post.timestamp).getTime();
      return Number.isNaN(time) ? latest : Math.max(latest, time);
    }, 0);

  const feedItems: FeedItem[] = [];
  const visiblePlatforms = PLATFORM_LIST.filter(platform =>
    filtered.some(post => post.platform === platform.id),
  ).sort((a, b) => newestIn(b.id) - newestIn(a.id));
  for (const platform of visiblePlatforms) {
    const platformPosts = filtered.filter(post => post.platform === platform.id);
    feedItems.push({ kind: 'platform', key: `platform:${platform.id}`, label: platform.name, platform: platform.id });
    const sourceKeys = Array.from(new Set(platformPosts.map(post => post.sourceKey ?? `${post.platform}:general`)));
    for (const sourceKey of sourceKeys) {
      const sourcePosts = platformPosts.filter(post => (post.sourceKey ?? `${post.platform}:general`) === sourceKey);
      const sourceLabel = sourcePosts[0]?.sourceLabel ?? 'General feed';
      feedItems.push({ kind: 'source', key: `source:${sourceKey}`, label: sourceLabel, platform: platform.id });
      const official = sourcePosts.filter(post => post.isOfficial);
      const community = sourcePosts.filter(post => !post.isOfficial);
      if (official.length > 0) {
        feedItems.push({ kind: 'category', key: `${sourceKey}:official`, label: 'Official / source posts', official: true });
        official.forEach(post => feedItems.push({ kind: 'post', key: post.id, post }));
      }
      if (community.length > 0) {
        feedItems.push({ kind: 'category', key: `${sourceKey}:community`, label: 'Community posts', official: false });
        community.forEach(post => feedItems.push({ kind: 'post', key: post.id, post }));
      }
    }
  }

  const handleCompose = useCallback((post: Post) => {
    startCompose(post);
    router.push({ pathname: '/edit/[postId]', params: { postId: post.id } });
  }, [startCompose]);

  const copyError = async () => {
    if (!lastFetchError) return;
    await Clipboard.setStringAsync(lastFetchError);
    setErrorCopied(true);
    setTimeout(() => setErrorCopied(false), 2000);
  };

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  const renderEmpty = () => {
    if (isFetchingPosts) return null;
    // Something is stored but nothing arrived in the last fetch: say so instead
    // of looking like the feed is broken, and offer the archive.
    if (activeFilter === 'new' && posts.length > 0) {
      return (
        <View style={styles.emptyContainer}>
          <Feather name="check-circle" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No new posts</Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            Nothing new since the last fetch. Switch to All to browse earlier posts.
          </Text>
          <TouchableOpacity
            onPress={() => setActiveFilter('all')}
            style={[styles.settingsBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.settingsBtnText}>Show all posts</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Feather name="inbox" size={48} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No posts yet</Text>
        <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
          {enabledPlatforms.length === 0
            ? 'Enable platforms in Settings to start fetching posts.'
            : 'The feed refreshes on its own when you open the app.'}
        </Text>
        {enabledPlatforms.length === 0 && (
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            style={[styles.settingsBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.settingsBtnText}>Open Settings</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <HeaderLogo onPress={() => router.push('/')} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Feed</Text>
        <View style={styles.headerRight}>
          <HeaderAvatar size={34} onPress={() => router.push('/settings')} />
        </View>
      </View>

      {/* Platform filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.filterBarContent}
      >
        <TouchableOpacity
          onPress={() => setActiveFilter('new')}
          style={[
            styles.filterChip,
            {
              backgroundColor: activeFilter === 'new' ? colors.primary : colors.card,
              borderColor: activeFilter === 'new' ? colors.primary : colors.border,
            },
          ]}
        >
          <Text style={[styles.filterText, { color: activeFilter === 'new' ? '#FFF' : colors.mutedForeground }]}>
            New ({newCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveFilter('all')}
          style={[
            styles.filterChip,
            {
              backgroundColor: activeFilter === 'all' ? colors.primary : colors.card,
              borderColor: activeFilter === 'all' ? colors.primary : colors.border,
            },
          ]}
        >
          <Text style={[styles.filterText, { color: activeFilter === 'all' ? '#FFF' : colors.mutedForeground }]}>
            All ({posts.length})
          </Text>
        </TouchableOpacity>
        {enabledPlatforms.map(p => {
          const platformPosts = posts.filter(post => post.platform === p.id);
          const count = platformPosts.length;
          const platformNew = platformPosts.filter(post => post.isNew).length;
          const isActive = activeFilter === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => setActiveFilter(p.id)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isActive ? p.bgColor : colors.card,
                  borderColor: isActive ? p.bgColor : colors.border,
                },
              ]}
            >
              <Text style={[styles.filterText, { color: isActive ? p.color : colors.mutedForeground }]}>
                {p.name} ({count})
              </Text>
              {platformNew > 0 && <View style={[styles.newDot, { backgroundColor: p.color }]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Error */}
      {lastFetchError && (
        <View style={[styles.errorBanner, { backgroundColor: colors.destructive + '20', borderColor: colors.destructive + '40' }]}>
          <Feather name="alert-circle" size={14} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>{lastFetchError}</Text>
          <TouchableOpacity onPress={copyError} accessibilityLabel="Copy error" hitSlop={8}>
            <Feather name={errorCopied ? 'check' : 'copy'} size={16} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      )}

      {/* Posts */}
      <FlatList
        data={feedItems}
        keyExtractor={item => item.key}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => {
          if (item.kind === 'post') {
            return <PostCard post={item.post} onCompose={() => handleCompose(item.post)} visible={visibleKeysRef.current.has(item.key)} />;
          }
          if (item.kind === 'platform') {
            const def = PLATFORM_LIST.find(platform => platform.id === item.platform);
            return (
              <View style={styles.platformSectionHeader}>
                <PlatformBadge platform={item.platform} size="sm" />
                <Text style={[styles.platformSectionTitle, { color: def?.color ?? colors.foreground }]}>
                  {item.label}
                </Text>
              </View>
            );
          }
          if (item.kind === 'source') {
            return (
              <View style={[styles.sourceHeader, { borderColor: colors.border }]}>
                <Feather name="hash" size={13} color={colors.mutedForeground} />
                <Text style={[styles.sourceTitle, { color: colors.foreground }]}>{item.label}</Text>
              </View>
            );
          }
          return (
            <View style={styles.categoryHeader}>
              <View style={[styles.categoryDot, { backgroundColor: item.official ? colors.warning : colors.mutedForeground }]} />
              <Text style={[styles.categoryTitle, { color: item.official ? colors.warning : colors.mutedForeground }]}>
                {item.label}
              </Text>
            </View>
          );
        }}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 90 }]}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterBar: { borderBottomWidth: 1, maxHeight: 52 },
  filterBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newDot: { width: 6, height: 6, borderRadius: 3 },
  filterText: { fontSize: 13, fontFamily: 'Inter_500Medium', flexShrink: 0 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    margin: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  listContent: { padding: 16 },
  platformSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  platformSectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 7,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  sourceTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  categoryDot: { width: 6, height: 6, borderRadius: 3 },
  categoryTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: { fontSize: 20, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 21,
  },
  settingsBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 8,
  },
  settingsBtnText: { color: '#FFF', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
