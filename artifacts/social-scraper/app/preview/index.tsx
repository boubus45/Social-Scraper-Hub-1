import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import PlatformPreviewCard from '@/components/PlatformPreviewCard';
import { PLATFORMS } from '@/constants/platforms';

export default function PreviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { composedPost, updatePlatformDraft, getEffectiveContent, clearCompose } = useApp();

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

  const apiPlatforms = composedPost.selectedPlatforms.filter(pid => PLATFORMS[pid].hasApi);
  const manualPlatforms = composedPost.selectedPlatforms.filter(pid => !PLATFORMS[pid].hasApi);

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

      {/* API platforms */}
      {apiPlatforms.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Feather name="zap" size={14} color={colors.success} />
            <Text style={[styles.sectionTitle, { color: colors.success }]}>Post via API</Text>
          </View>
          {apiPlatforms.map(pid => (
            <PlatformPreviewCard
              key={pid}
              platform={PLATFORMS[pid]}
              content={getEffectiveContent(pid)}
              isEdited={composedPost.drafts[pid]?.edited ?? false}
              onContentChange={(text) => updatePlatformDraft(pid, text)}
            />
          ))}
        </>
      )}

      {/* Manual platforms */}
      {manualPlatforms.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Feather name="upload" size={14} color={colors.warning} />
            <Text style={[styles.sectionTitle, { color: colors.warning }]}>Post manually</Text>
          </View>
          <View style={[styles.manualNote, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.manualNoteText, { color: colors.mutedForeground }]}>
              These platforms don't offer a public API. Copy your content and open the app to post manually.
            </Text>
          </View>
          {manualPlatforms.map(pid => (
            <PlatformPreviewCard
              key={pid}
              platform={PLATFORMS[pid]}
              content={getEffectiveContent(pid)}
              isEdited={composedPost.drafts[pid]?.edited ?? false}
              onContentChange={(text) => updatePlatformDraft(pid, text)}
            />
          ))}
        </>
      )}

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
