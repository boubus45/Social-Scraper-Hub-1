import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import PlatformBadge from '@/components/PlatformBadge';
import PlatformSelector from '@/components/PlatformSelector';
import { PLATFORM_LIST } from '@/constants/platforms';
import { PlatformId } from '@/types';

export default function ComposeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { composedPost, startCompose, updateBaseContent, toggleSelectedPlatform, settings, clearCompose } = useApp();

  const enabledForPost = PLATFORM_LIST
    .filter(p => settings.platforms[p.id].postEnabled)
    .map(p => p.id) as PlatformId[];

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  const handleNewPost = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startCompose();
  };

  const handleGoToFeed = () => {
    Haptics.selectionAsync();
    router.push('/');
  };

  const handlePreview = () => {
    if (!composedPost?.baseContent.trim()) return;
    if (composedPost.selectedPlatforms.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/preview');
  };

  const charCount = composedPost?.baseContent.length ?? 0;
  const canPreview = composedPost && composedPost.baseContent.trim().length > 0 && composedPost.selectedPlatforms.length > 0;

  if (!composedPost) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12 }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Compose</Text>
        </View>
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="edit-2" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Start composing</Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            Create a new post from scratch, or pick an existing post from your feed to rephrase.
          </Text>
          <TouchableOpacity
            onPress={handleNewPost}
            activeOpacity={0.85}
            style={[styles.newPostBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="plus" size={18} color="#FFF" />
            <Text style={styles.newPostBtnText}>New Post</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleGoToFeed} activeOpacity={0.7}>
            <Text style={[styles.feedLink, { color: colors.primary }]}>
              Pick from Feed →
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Compose</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={clearCompose} activeOpacity={0.7} style={styles.clearBtn}>
            <Text style={[styles.clearBtnText, { color: colors.mutedForeground }]}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Original post reference */}
      {composedPost.originalPost && (
        <View style={[styles.originalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.originalHeader}>
            <Feather name="corner-down-right" size={14} color={colors.mutedForeground} />
            <Text style={[styles.originalLabel, { color: colors.mutedForeground }]}>Rephrasing from</Text>
            <PlatformBadge platform={composedPost.originalPost.platform} size="sm" />
          </View>
          <Text style={[styles.originalAuthor, { color: colors.foreground }]}>
            {composedPost.originalPost.authorHandle}
          </Text>
          <Text style={[styles.originalContent, { color: colors.mutedForeground }]} numberOfLines={3}>
            {composedPost.originalPost.content}
          </Text>
        </View>
      )}

      {/* Text editor */}
      <View style={[styles.editorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          style={[styles.editor, { color: colors.foreground }]}
          value={composedPost.baseContent}
          onChangeText={updateBaseContent}
          multiline
          textAlignVertical="top"
          placeholderTextColor={colors.mutedForeground}
          placeholder="What do you want to share?"
          autoFocus={!composedPost.originalPost}
        />
        <View style={[styles.editorFooter, { borderTopColor: colors.border }]}>
          <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
            {charCount} characters
          </Text>
          {composedPost.aiRephrased && (
            <View style={[styles.aiTag, { backgroundColor: colors.primary + '20' }]}>
              <Feather name="zap" size={11} color={colors.primary} />
              <Text style={[styles.aiTagText, { color: colors.primary }]}>AI rephrased</Text>
            </View>
          )}
        </View>
      </View>

      {/* AI rephrase shortcut */}
      {composedPost.originalPost && (
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/edit/[postId]', params: { postId: composedPost.originalPost!.id } })}
          activeOpacity={0.8}
          style={[styles.aiBtn, { backgroundColor: colors.card, borderColor: colors.primary + '40' }]}
        >
          <View style={[styles.aiBtnIcon, { backgroundColor: colors.primary + '20' }]}>
            <Feather name="zap" size={16} color={colors.primary} />
          </View>
          <View style={styles.aiBtnText}>
            <Text style={[styles.aiBtnTitle, { color: colors.foreground }]}>AI Rephrase</Text>
            <Text style={[styles.aiBtnSubtitle, { color: colors.mutedForeground }]}>
              Customize tone for each platform
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}

      {/* Platform selector */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <PlatformSelector
          selected={composedPost.selectedPlatforms}
          onToggle={toggleSelectedPlatform}
          label="Post to"
          enabledOnly={enabledForPost.length > 0}
          enabledPlatforms={enabledForPost.length > 0 ? enabledForPost : undefined}
        />
        {enabledForPost.length === 0 && (
          <TouchableOpacity onPress={() => router.push('/settings')} activeOpacity={0.7}>
            <Text style={[styles.enableHint, { color: colors.primary }]}>
              Enable platforms for posting in Settings →
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Preview button */}
      <TouchableOpacity
        onPress={handlePreview}
        activeOpacity={0.85}
        disabled={!canPreview}
        style={[
          styles.previewBtn,
          { backgroundColor: canPreview ? colors.primary : colors.muted },
        ]}
      >
        <Text style={[styles.previewBtnText, { color: canPreview ? '#FFF' : colors.mutedForeground }]}>
          Preview & Post
        </Text>
        <Feather name="arrow-right" size={18} color={canPreview ? '#FFF' : colors.mutedForeground} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 16,
    borderBottomWidth: 0,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  headerRight: { flexDirection: 'row', gap: 8 },
  clearBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  clearBtnText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 21,
  },
  newPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 4,
  },
  newPostBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  feedLink: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  originalCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
  },
  originalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  originalLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  originalAuthor: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  originalContent: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },
  editorCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  editor: {
    minHeight: 140,
    padding: 14,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 23,
  },
  editorFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  charCount: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  aiTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  aiTagText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  aiBtnIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBtnText: { flex: 1 },
  aiBtnTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  aiBtnSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  enableHint: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
  },
  previewBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
});
