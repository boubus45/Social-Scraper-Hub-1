import React, { useState } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { Post } from '@/types';
import PlatformBadge from '@/components/PlatformBadge';

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function formatCount(n?: number): string {
  if (!n) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

interface Props {
  post: Post;
  onCompose: () => void;
}

export default function PostCard({ post, onCompose }: Props) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const handleToggle = () => {
    Haptics.selectionAsync();
    setExpanded(prev => !prev);
  };

  const handleCompose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCompose();
  };

  const PREVIEW_LENGTH = 180;
  const needsTruncation = post.content.length > PREVIEW_LENGTH;
  const displayContent = expanded || !needsTruncation
    ? post.content
    : post.content.slice(0, PREVIEW_LENGTH) + '…';
  const media = post.media?.filter(Boolean) ?? [];

  return (
    <View style={[
      styles.card,
      {
        backgroundColor: colors.card,
        borderColor: post.isOfficial ? colors.warning : post.isNew ? colors.primary : colors.border,
        borderLeftWidth: post.isOfficial || post.isNew ? 3 : 1,
      },
    ]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.authorRow}>
          <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.avatarText, { color: colors.mutedForeground }]}>
              {post.authorHandle?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <View style={styles.authorInfo}>
            <Text style={[styles.author, { color: colors.foreground }]} numberOfLines={1}>
              {post.author}
            </Text>
            <Text style={[styles.handle, { color: colors.mutedForeground }]} numberOfLines={1}>
              {post.authorHandle} · {formatRelativeTime(post.timestamp)}
            </Text>
          </View>
        </View>
        <View style={styles.badges}>
          {post.isNew && (
            <View style={[styles.newBadge, { backgroundColor: colors.primary }]}>
              <Feather name="star" size={10} color="#FFF" />
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
          )}
          {post.isOfficial && (
            <View style={[styles.officialBadge, { backgroundColor: colors.warning + '20', borderColor: colors.warning + '60' }]}>
              <Feather name="check-circle" size={10} color={colors.warning} />
              <Text style={[styles.officialBadgeText, { color: colors.warning }]}>SOURCE</Text>
            </View>
          )}
          <PlatformBadge platform={post.platform} size="sm" />
        </View>
      </View>

      {/* Content */}
      <TouchableOpacity onPress={needsTruncation ? handleToggle : undefined} activeOpacity={needsTruncation ? 0.8 : 1}>
        <Text style={[styles.content, { color: colors.foreground }]}>
          {displayContent || 'Instagram post'}
        </Text>
        {needsTruncation && (
          <View style={styles.expandRow}>
            <Text style={[styles.expandText, { color: colors.primary }]}>
              {expanded ? 'Show less' : 'Read more'}
            </Text>
            <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={colors.primary} />
          </View>
        )}
      </TouchableOpacity>

      {media.length > 0 && (
        <View style={styles.mediaGrid}>
          {media.slice(0, 4).map((url, index) => (
            <Image
              key={`${url}-${index}`}
              source={{ uri: url }}
              style={styles.mediaImage}
              resizeMode="cover"
              accessibilityLabel={`Post media ${index + 1}`}
            />
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.statsRow}>
          {post.likes !== undefined && (
            <View style={styles.stat}>
              <Feather name="heart" size={13} color={colors.mutedForeground} />
              <Text style={[styles.statText, { color: colors.mutedForeground }]}>{formatCount(post.likes)}</Text>
            </View>
          )}
          {post.reposts !== undefined && (
            <View style={styles.stat}>
              <Feather name="repeat" size={13} color={colors.mutedForeground} />
              <Text style={[styles.statText, { color: colors.mutedForeground }]}>{formatCount(post.reposts)}</Text>
            </View>
          )}
          {post.comments !== undefined && (
            <View style={styles.stat}>
              <Feather name="message-circle" size={13} color={colors.mutedForeground} />
              <Text style={[styles.statText, { color: colors.mutedForeground }]}>{formatCount(post.comments)}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={handleCompose}
          activeOpacity={0.8}
          style={[styles.composeBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="edit-2" size={13} color="#FFFFFF" />
          <Text style={styles.composeBtnText}>Compose</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  newBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
  },
  newBadgeText: { color: '#FFF', fontSize: 9, fontFamily: 'Inter_700Bold' },
  officialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  officialBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  authorInfo: { flex: 1 },
  author: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  handle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  content: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
  },
  mediaGrid: {
    gap: 8,
  },
  mediaImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#252538',
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  expandText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  composeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  composeBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
