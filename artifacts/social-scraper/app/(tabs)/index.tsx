import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import PostCard from '@/components/PostCard';
import PlatformBadge from '@/components/PlatformBadge';
import { PlatformId, Post } from '@/types';
import { PLATFORM_LIST } from '@/constants/platforms';

type FilterId = 'all' | PlatformId;

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { posts, isFetchingPosts, fetchPosts, lastFetchError, startCompose, settings } = useApp();
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');

  const enabledPlatforms = PLATFORM_LIST.filter(p => settings.platforms[p.id].fetchEnabled);

  const filtered = activeFilter === 'all'
    ? posts
    : posts.filter(p => p.platform === activeFilter);

  const handleCompose = useCallback((post: Post) => {
    startCompose(post);
    router.push({ pathname: '/edit/[postId]', params: { postId: post.id } });
  }, [startCompose]);

  const handleRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fetchPosts();
  };

  const topPad = Platform.OS === 'web'
    ? Math.max(insets.top, 67)
    : insets.top;

  const renderEmpty = () => {
    if (isFetchingPosts) return null;
    return (
      <View style={styles.emptyContainer}>
        <Feather name="inbox" size={48} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No posts yet</Text>
        <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
          {enabledPlatforms.length === 0
            ? 'Enable platforms in Settings to start fetching posts.'
            : 'Pull down to refresh, or tap the refresh button.'}
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Feed</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn} activeOpacity={0.7}>
          {isFetchingPosts
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Feather name="refresh-cw" size={20} color={colors.foreground} />
          }
        </TouchableOpacity>
      </View>

      {/* Platform filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.filterBarContent}
      >
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
          const count = posts.filter(post => post.platform === p.id).length;
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
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Error */}
      {lastFetchError && (
        <View style={[styles.errorBanner, { backgroundColor: colors.destructive + '20', borderColor: colors.destructive + '40' }]}>
          <Feather name="alert-circle" size={14} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]} numberOfLines={2}>{lastFetchError}</Text>
        </View>
      )}

      {/* Posts */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <PostCard post={item} onCompose={() => handleCompose(item)} />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        onRefresh={handleRefresh}
        refreshing={isFetchingPosts}
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBar: {
    borderBottomWidth: 1,
    maxHeight: 52,
  },
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
  },
  filterText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 8,
  },
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
  settingsBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
});
