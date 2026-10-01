import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { HeaderLogo } from '@/components/HeaderLogo';
import { HeaderAvatar } from '@/components/HeaderAvatar';
import { PlatformId, Post } from '@/types';
import { PLATFORM_LIST } from '@/constants/platforms';

/**
 * `newest` (the default) is every platform's posts in one flat, strictly
 * chronological list: the newest post first, the oldest last. Grouping by
 * platform or source is deliberately gone — it forced you to scroll past one
 * account's whole archive before reaching anyone else's new posts.
 * A platform chip narrows the same flat list to that platform.
 */
type FilterId = 'newest' | PlatformId;

function newestFirst(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    // Undated posts sort to the bottom rather than breaking the ordering.
    if (Number.isNaN(aTime)) return Number.isNaN(bTime) ? 0 : 1;
    if (Number.isNaN(bTime)) return -1;
    return bTime - aTime;
  });
}

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { posts, isFetchingPosts, lastFetchError, startCompose, settings } = useApp();
  const [activeFilter, setActiveFilter] = useState<FilterId>('newest');
  const [errorCopied, setErrorCopied] = useState(false);
  // Viewability drives video autoplay, so it has to be state: a ref would
  // update silently and leave every card playing on its last-known value.
  const [activePostKey, setActivePostKey] = useState<string | null>(null);
  const lastActiveRef = useRef<string | null>(null);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    // One video plays at a time: the on-screen item closest to the middle of
    // the list, which for these media cards is the one filling the viewport.
    let best: ViewToken | null = null;
    for (const candidate of viewableItems) {
      if (!candidate.isViewable || !candidate.item) continue;
      if (!best || (candidate.item.index ?? 0) > (best.item.index ?? 0)) best = candidate;
    }
    const next = best ? String((best.item as { id?: string }).id) : null;
    if (next === lastActiveRef.current) return;
    lastActiveRef.current = next;
    setActivePostKey(next);
  }).current;

  const enabledPlatforms = useMemo(
    () => PLATFORM_LIST.filter(p => settings.platforms[p.id].fetchEnabled),
    [settings.platforms],
  );

  const filtered = useMemo(() => {
    const scoped =
      activeFilter === 'newest' ? posts : posts.filter(post => post.platform === activeFilter);
    return newestFirst(scoped);
  }, [posts, activeFilter]);

  const countFor = useCallback(
    (filter: FilterId) =>
      filter === 'newest' ? posts.length : posts.filter(post => post.platform === filter).length,
    [posts],
  );
  const newCountFor = useCallback(
    (platform: PlatformId) => posts.filter(post => post.platform === platform && post.isNew).length,
    [posts],
  );

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
    if (posts.length === 0) {
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
    }
    return (
      <View style={styles.emptyContainer}>
        <Feather name="check-circle" size={48} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No posts on this platform</Text>
        <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
          Switch back to Newest to see everything, or add an account in Settings.
        </Text>
        <TouchableOpacity
          onPress={() => setActiveFilter('newest')}
          style={[styles.settingsBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.settingsBtnText}>Show all posts</Text>
        </TouchableOpacity>
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
          onPress={() => setActiveFilter('newest')}
          style={[
            styles.filterChip,
            {
              backgroundColor: activeFilter === 'newest' ? colors.primary : colors.card,
              borderColor: activeFilter === 'newest' ? colors.primary : colors.border,
            },
          ]}
        >
          <Text style={[styles.filterText, { color: activeFilter === 'newest' ? '#FFF' : colors.mutedForeground }]}>
            Newest ({countFor('newest')})
          </Text>
        </TouchableOpacity>
        {enabledPlatforms.map(p => {
          const count = countFor(p.id);
          const platformNew = newCountFor(p.id);
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

      {/* Posts: one flat, newest-first list */}
      <FlatList
        data={filtered}
        keyExtractor={post => post.id}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onCompose={() => handleCompose(item)}
            visible={activePostKey === item.id}
          />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 90 }]}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
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