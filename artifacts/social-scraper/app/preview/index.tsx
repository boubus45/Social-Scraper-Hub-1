import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import PlatformPreviewCard from '@/components/PlatformPreviewCard';
import { PLATFORMS } from '@/constants/platforms';
import { PlatformId } from '@/types';
import { hasPostingCredentials } from '@/lib/platformPosters';

export default function PreviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    composedPost,
    updatePlatformDraft,
    getEffectiveContent,
    clearCompose,
    settings,
    postNow,
  } = useApp();
  const [postModes, setPostModes] = useState<Record<string, 'manual' | 'api'>>({});

  if (!composedPost || composedPost.selectedPlatforms.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[styles.emptyText, { color: colors.foreground }]}>Nothing to preview</Text>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8} style={[styles.backBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.backBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const canUseApi = (pid: PlatformId) => {
    const platformSettings = settings.platforms[pid];
    return Boolean(
      PLATFORMS[pid].hasApi &&
      platformSettings?.useApi &&
      platformSettings.postEnabled &&
      hasPostingCredentials(pid, platformSettings.credentials),
    );
  };

  const getMode = (pid: PlatformId): 'manual' | 'api' =>
    postModes[pid] ?? (canUseApi(pid) ? 'api' : 'manual');

  const handleDone = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    clearCompose();
    router.replace('/');
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Info banner */}
      <View style={[styles.infoBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="info" size={14} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
          Each preview is independently editable. Changes here don't affect other platforms.
        </Text>
      </View>

        <View style={styles.sectionHeader}>
          <Feather name="send" size={14} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Choose how to post</Text>
        </View>
        <View style={[styles.manualNote, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.manualNoteText, { color: colors.mutedForeground }]}>
            Open app is the default and pre-fills the message where the platform allows it. Choose Use API on a card only when API credentials are configured.
          </Text>
        </View>
        {composedPost.selectedPlatforms.map(pid => (
            <PlatformPreviewCard
              key={pid}
              platform={PLATFORMS[pid]}
              content={getEffectiveContent(pid)}
              isEdited={composedPost.drafts[pid]?.edited ?? false}
              onContentChange={(text) => updatePlatformDraft(pid, text)}
              mode={getMode(pid)}
              canUseApi={canUseApi(pid)}
              onModeChange={(mode) => setPostModes(prev => ({ ...prev, [pid]: mode }))}
              onPost={() => postNow(pid, getEffectiveContent(pid))}
            />
        ))}

      {/* Done button */}
      <TouchableOpacity
        onPress={handleDone}
        activeOpacity={0.85}
        style={[styles.doneBtn, { backgroundColor: colors.success + '20', borderColor: colors.success }]}
      >
        <Feather name="check-circle" size={18} color={colors.success} />
        <Text style={[styles.doneBtnText, { color: colors.success }]}>Done – Back to Feed</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 4 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 40,
  },
  emptyText: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  backBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  backBtnText: { color: '#FFF', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  infoText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  sectionTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  manualNote: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  manualNoteText: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
  },
  doneBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
