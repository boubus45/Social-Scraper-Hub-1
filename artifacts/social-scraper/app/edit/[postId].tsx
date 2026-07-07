import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { router, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import PlatformBadge from '@/components/PlatformBadge';
import PlatformSelector from '@/components/PlatformSelector';
import { PLATFORM_LIST } from '@/constants/platforms';
import { AI_TONE_LABELS, AITone, PlatformId } from '@/types';

const TONES: AITone[] = ['professional', 'casual', 'concise', 'expanded', 'engaging'];

export default function EditScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    posts, composedPost, startCompose, updateBaseContent,
    toggleSelectedPlatform, settings, rephrasePost, applyRephrase, isRephrasing,
  } = useApp();

  const [showAISheet, setShowAISheet] = useState(false);
  const [selectedTone, setSelectedTone] = useState<AITone>('engaging');
  const [rephrasePlatform, setRephrasePlatform] = useState<PlatformId | undefined>();

  const post = postId !== 'new' ? posts.find(p => p.id === postId) : undefined;

  useEffect(() => {
    // Re-initialize only if postId changed and this is a different post than currently composing
    if (composedPost?.originalPost?.id === postId) return;
    const foundPost = posts.find(p => p.id === postId);
    startCompose(foundPost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const enabledForPost = PLATFORM_LIST
    .filter(p => settings.platforms[p.id].postEnabled)
    .map(p => p.id) as PlatformId[];

  const handleRephrase = async () => {
    if (!settings.ai.apiKey) {
      Alert.alert('No AI Key', 'Configure your AI API key in Settings → AI Model first.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const targetPlatform = rephrasePlatform ?? (composedPost?.selectedPlatforms[0] as PlatformId | undefined);
      if (!targetPlatform) {
        Alert.alert('Select a platform', 'Select at least one target platform before rephrasing.');
        return;
      }
      const result = await rephrasePost(targetPlatform, selectedTone);
      applyRephrase(result, rephrasePlatform);
      setShowAISheet(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Rephrase failed';
      Alert.alert('Error', msg);
    }
  };

  const handlePreview = () => {
    if (!composedPost?.baseContent.trim()) {
      Alert.alert('Empty post', 'Write some content first.');
      return;
    }
    if (!composedPost.selectedPlatforms.length) {
      Alert.alert('No platforms', 'Select at least one platform to post to.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/preview');
  };

  if (!composedPost) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const charCount = composedPost.baseContent.length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Original post */}
      {composedPost.originalPost && (
        <View style={[styles.originalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.originalHeader}>
            <Text style={[styles.originalLabel, { color: colors.mutedForeground }]}>Original post</Text>
            <PlatformBadge platform={composedPost.originalPost.platform} size="sm" />
          </View>
          <Text style={[styles.originalAuthor, { color: colors.foreground }]}>
            {composedPost.originalPost.authorHandle}
          </Text>
          <Text style={[styles.originalContent, { color: colors.mutedForeground }]} numberOfLines={4}>
            {composedPost.originalPost.content}
          </Text>
        </View>
      )}

      {/* Editor */}
      <View style={[styles.editorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          style={[styles.editor, { color: colors.foreground }]}
          value={composedPost.baseContent}
          onChangeText={updateBaseContent}
          multiline
          textAlignVertical="top"
          placeholderTextColor={colors.mutedForeground}
          placeholder="What do you want to share?"
        />
        <View style={[styles.editorFooter, { borderTopColor: colors.border }]}>
          <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
            {charCount} characters
          </Text>
          {composedPost.aiRephrased && (
            <View style={[styles.aiTag, { backgroundColor: colors.primary + '20' }]}>
              <Feather name="zap" size={11} color={colors.primary} />
              <Text style={[styles.aiTagText, { color: colors.primary }]}>AI edited</Text>
            </View>
          )}
        </View>
      </View>

      {/* AI Rephrase button */}
      <TouchableOpacity
        onPress={() => setShowAISheet(true)}
        activeOpacity={0.8}
        style={[styles.aiBtn, { backgroundColor: colors.card, borderColor: colors.primary + '50' }]}
      >
        <View style={[styles.aiBtnIcon, { backgroundColor: colors.primary + '20' }]}>
          <Feather name="zap" size={16} color={colors.primary} />
        </View>
        <View style={styles.aiBtnInfo}>
          <Text style={[styles.aiBtnTitle, { color: colors.foreground }]}>AI Rephrase</Text>
          <Text style={[styles.aiBtnSubtitle, { color: colors.mutedForeground }]}>
            Choose tone and target platform
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>

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
        style={[styles.previewBtn, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.previewBtnText}>Preview & Post</Text>
        <Feather name="arrow-right" size={18} color="#FFF" />
      </TouchableOpacity>

      {/* AI Rephrase Modal */}
      <Modal
        visible={showAISheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAISheet(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAISheet(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>AI Rephrase</Text>
            <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
              Choose a tone and optionally target a specific platform
            </Text>

            {/* Tone selector */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TONE</Text>
            <View style={styles.toneGrid}>
              {TONES.map(tone => (
                <TouchableOpacity
                  key={tone}
                  onPress={() => setSelectedTone(tone)}
                  style={[
                    styles.toneChip,
                    {
                      backgroundColor: selectedTone === tone ? colors.primary : colors.secondary,
                      borderColor: selectedTone === tone ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.toneText, { color: selectedTone === tone ? '#FFF' : colors.mutedForeground }]}>
                    {AI_TONE_LABELS[tone]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Platform target */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TARGET PLATFORM (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.platformRow}>
              <TouchableOpacity
                onPress={() => setRephrasePlatform(undefined)}
                style={[
                  styles.platformChip,
                  {
                    backgroundColor: !rephrasePlatform ? colors.primary : colors.secondary,
                    borderColor: !rephrasePlatform ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.platformChipText, { color: !rephrasePlatform ? '#FFF' : colors.mutedForeground }]}>
                  Base (all)
                </Text>
              </TouchableOpacity>
              {composedPost.selectedPlatforms.map(pid => {
                const def = PLATFORM_LIST.find(p => p.id === pid);
                if (!def) return null;
                return (
                  <TouchableOpacity
                    key={pid}
                    onPress={() => setRephrasePlatform(pid)}
                    style={[
                      styles.platformChip,
                      {
                        backgroundColor: rephrasePlatform === pid ? def.bgColor : colors.secondary,
                        borderColor: rephrasePlatform === pid ? def.bgColor : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.platformChipText, { color: rephrasePlatform === pid ? def.color : colors.mutedForeground }]}>
                      {def.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              onPress={handleRephrase}
              activeOpacity={0.85}
              disabled={isRephrasing}
              style={[styles.rephraseBtn, { backgroundColor: colors.primary, opacity: isRephrasing ? 0.7 : 1 }]}
            >
              {isRephrasing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Feather name="zap" size={16} color="#FFF" />
                  <Text style={styles.rephraseBtnText}>Rephrase Now</Text>
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  originalCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
    padding: 14,
    gap: 6,
  },
  originalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  originalLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  originalAuthor: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  originalContent: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  editorCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  editor: {
    minHeight: 160,
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
  charCount: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  aiTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  aiTagText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  aiBtnIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  aiBtnInfo: { flex: 1 },
  aiBtnTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  aiBtnSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  section: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 12 },
  enableHint: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 4,
  },
  previewBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 4,
  },
  sheetTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  sheetSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: -8 },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 0.8 },
  toneGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: -4,
  },
  toneChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  toneText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  platformRow: { maxHeight: 48, marginTop: -4 },
  platformChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  platformChipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  rephraseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 4,
  },
  rephraseBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
