import React, { useState } from 'react';
import {
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
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import PlatformBadge from '@/components/PlatformBadge';
import PlatformSelector from '@/components/PlatformSelector';
import { HeaderLogo } from '@/components/HeaderLogo';
import { HeaderAvatar } from '@/components/HeaderAvatar';
import { PLATFORM_LIST } from '@/constants/platforms';
import { Draft, PlatformId } from '@/types';
import { hasPostingCredentials } from '@/lib/platformPosters';

// ─── Schedule picker modal ─────────────────────────────────────────────────

function ScheduleModal({
  visible,
  onClose,
  onSchedule,
  selectedPlatforms,
  platformSettings,
}: {
  visible: boolean;
  onClose: () => void;
  onSchedule: (isoDate: string, redditTarget: string) => void;
  selectedPlatforms: PlatformId[];
  platformSettings: Record<string, { postEnabled: boolean; credentials: Record<string, unknown> }>;
}) {
  const colors = useColors();
  const pad = (n: number) => String(n).padStart(2, '0');
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [dateStr, setDateStr] = useState(
    `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`
  );
  const [timeStr, setTimeStr] = useState(`${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`);
  const [redditTarget, setRedditTarget] = useState('');

  // Compute which platforms will auto-post
  const willPost = selectedPlatforms.filter(pid => {
    const ps = platformSettings[pid];
    return ps?.postEnabled && hasPostingCredentials(pid, ps.credentials as Parameters<typeof hasPostingCredentials>[1]);
  });
  const wontPost = selectedPlatforms.filter(p => !willPost.includes(p));

  const hasReddit = willPost.includes('reddit');

  const handleConfirm = () => {
    const dt = new Date(`${dateStr}T${timeStr}:00`);
    if (isNaN(dt.getTime())) {
      Alert.alert('Invalid date/time', 'Enter date as YYYY-MM-DD and time as HH:MM.');
      return;
    }
    if (dt.getTime() <= Date.now()) {
      Alert.alert('Choose a future time', 'The scheduled time must be in the future.');
      return;
    }
    if (willPost.length === 0) {
      Alert.alert(
        'No platforms will auto-post',
        'None of the selected platforms have API credentials configured. Add credentials in Settings first, or save as a plain draft instead.',
      );
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSchedule(dt.toISOString(), redditTarget.trim().replace(/^r\//, ''));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sched.overlay}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={[sched.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={sched.handle} />
            <View style={sched.header}>
              <Feather name="clock" size={18} color={colors.primary} />
              <Text style={[sched.title, { color: colors.foreground }]}>Schedule Post</Text>
            </View>

            {/* Auto-post preview */}
            {willPost.length > 0 ? (
              <View style={[sched.autoRow, { backgroundColor: '#16a34a20', borderColor: '#16a34a44' }]}>
                <Feather name="zap" size={13} color="#16a34a" />
                <Text style={[sched.autoText, { color: '#16a34a' }]}>
                  Will auto-post to: {willPost.join(', ')}
                </Text>
              </View>
            ) : (
              <View style={[sched.autoRow, { backgroundColor: colors.destructive + '18', borderColor: colors.destructive + '44' }]}>
                <Feather name="alert-circle" size={13} color={colors.destructive} />
                <Text style={[sched.autoText, { color: colors.destructive }]}>
                  No platforms with API credentials — post won't fire automatically.
                </Text>
              </View>
            )}
            {wontPost.length > 0 && (
              <Text style={[sched.skipNote, { color: colors.mutedForeground }]}>
                ⚠ Skipped (no credentials): {wontPost.join(', ')}
              </Text>
            )}

            <View style={sched.fieldGroup}>
              <Text style={[sched.label, { color: colors.mutedForeground }]}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={[sched.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
                value={dateStr}
                onChangeText={setDateStr}
                placeholder="2026-07-20"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
            </View>

            <View style={sched.fieldGroup}>
              <Text style={[sched.label, { color: colors.mutedForeground }]}>Time (HH:MM, 24-hour)</Text>
              <TextInput
                style={[sched.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
                value={timeStr}
                onChangeText={setTimeStr}
                placeholder="14:30"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
            </View>

            {hasReddit && (
              <View style={sched.fieldGroup}>
                <Text style={[sched.label, { color: colors.mutedForeground }]}>
                  Reddit subreddit to post to (e.g. programming)
                </Text>
                <TextInput
                  style={[sched.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
                  value={redditTarget}
                  onChangeText={setRedditTarget}
                  placeholder="Leave blank to post to your profile"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            )}

            <View style={sched.actions}>
              <TouchableOpacity onPress={onClose} style={[sched.btn, { borderColor: colors.border }]}>
                <Text style={[sched.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirm}
                style={[sched.btn, sched.btnPrimary, { backgroundColor: colors.primary }]}
              >
                <Feather name="clock" size={14} color="#FFF" />
                <Text style={[sched.btnText, { color: '#FFF' }]}>Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const sched = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#444', alignSelf: 'center', marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  autoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    padding: 10, borderRadius: 8, borderWidth: 1,
  },
  autoText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  skipNote: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: -8 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: 12, borderWidth: 1,
  },
  btnPrimary: { borderWidth: 0 },
  btnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});

// ─── Draft card ────────────────────────────────────────────────────────────

function DraftCard({
  draft,
  onLoad,
  onDelete,
  colors,
}: {
  draft: Draft;
  onLoad: () => void;
  onDelete: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const isScheduled = !!draft.scheduledAt;
  const scheduledDate = draft.scheduledAt ? new Date(draft.scheduledAt) : null;
  const isPast = scheduledDate ? scheduledDate.getTime() < Date.now() : false;
  const preview = draft.composedPost.baseContent.trim().slice(0, 120) || '(empty)';

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={[draftSt.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Status badge */}
      <View style={draftSt.cardTop}>
        {isScheduled ? (
          <View style={[draftSt.badge, { backgroundColor: isPast ? colors.destructive + '22' : colors.primary + '22' }]}>
            <Feather name="clock" size={11} color={isPast ? colors.destructive : colors.primary} />
            <Text style={[draftSt.badgeText, { color: isPast ? colors.destructive : colors.primary }]}>
              {isPast ? 'Overdue · ' : 'Scheduled · '}
              {formatTime(draft.scheduledAt!)}
            </Text>
          </View>
        ) : (
          <View style={[draftSt.badge, { backgroundColor: colors.muted }]}>
            <Feather name="file-text" size={11} color={colors.mutedForeground} />
            <Text style={[draftSt.badgeText, { color: colors.mutedForeground }]}>
              Draft · {formatTime(draft.savedAt)}
            </Text>
          </View>
        )}
        <View style={draftSt.platforms}>
          {draft.composedPost.selectedPlatforms.slice(0, 3).map(p => (
            <PlatformBadge key={p} platform={p} size="sm" />
          ))}
        </View>
      </View>

      <Text style={[draftSt.preview, { color: colors.foreground }]} numberOfLines={2}>
        {preview}
      </Text>

      <View style={draftSt.cardActions}>
        <TouchableOpacity
          onPress={onLoad}
          style={[draftSt.actionBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
        >
          <Feather name="edit-2" size={13} color="#FFF" />
          <Text style={draftSt.actionBtnText}>Resume</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDelete}
          style={[draftSt.actionBtn, { backgroundColor: colors.destructive + '22', borderWidth: 1, borderColor: colors.destructive + '44' }]}
          activeOpacity={0.8}
        >
          <Feather name="trash-2" size={13} color={colors.destructive} />
          <Text style={[draftSt.actionBtnText, { color: colors.destructive }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const draftSt = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  platforms: { flexDirection: 'row', gap: 4 },
  preview: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionBtnText: { color: '#FFF', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});

// ─── Main screen ───────────────────────────────────────────────────────────

export default function ComposeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    composedPost, startCompose, updateBaseContent, toggleSelectedPlatform,
    settings, clearCompose, saveDraft, loadDraft, deleteDraft, drafts,
  } = useApp();

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

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

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const id = await saveDraft();
    setIsSavingDraft(false);
    if (id) {
      Alert.alert('Draft saved', 'Your draft has been saved. You can resume it anytime from the Drafts section.');
      clearCompose();
    }
  };

  const handleSchedule = async (isoDate: string, redditTarget: string) => {
    const id = await saveDraft(isoDate, redditTarget || undefined);
    if (id) {
      const d = new Date(isoDate);
      Alert.alert(
        'Scheduled ✓',
        `Post scheduled for ${d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}. The app will auto-post when the time hits (keep it open).`
      );
      clearCompose();
    }
  };

  const handleLoadDraft = (draftId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    loadDraft(draftId);
  };

  const handleDeleteDraft = (draftId: string) => {
    Alert.alert('Delete draft?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          deleteDraft(draftId);
        },
      },
    ]);
  };

  const charCount = composedPost?.baseContent.length ?? 0;
  const canPreview = composedPost && composedPost.baseContent.trim().length > 0 && composedPost.selectedPlatforms.length > 0;
  const canSaveDraft = composedPost && composedPost.baseContent.trim().length > 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <HeaderLogo onPress={() => router.push('/')} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Compose</Text>
        <View style={styles.headerRight}>
          {composedPost && (
            <TouchableOpacity onPress={clearCompose} activeOpacity={0.7} style={styles.clearBtn}>
              <Text style={[styles.clearBtnText, { color: colors.mutedForeground }]}>Clear</Text>
            </TouchableOpacity>
          )}
          <HeaderAvatar size={34} onPress={() => router.push('/settings')} />
        </View>
      </View>

      {/* New post CTA (when nothing composed) */}
      {!composedPost && (
        <View style={styles.newPostRow}>
          <TouchableOpacity
            onPress={handleNewPost}
            activeOpacity={0.85}
            style={[styles.newPostBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="plus" size={18} color="#FFF" />
            <Text style={styles.newPostBtnText}>New Post</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleGoToFeed} activeOpacity={0.7}
            style={[styles.feedBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <Feather name="rss" size={16} color={colors.foreground} />
            <Text style={[styles.feedBtnText, { color: colors.foreground }]}>Pick from Feed</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Compose area */}
      {composedPost && (
        <>
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

          {/* Primary action */}
          <TouchableOpacity
            onPress={handlePreview}
            activeOpacity={0.85}
            disabled={!canPreview}
            style={[styles.previewBtn, { backgroundColor: canPreview ? colors.primary : colors.muted }]}
          >
            <Text style={[styles.previewBtnText, { color: canPreview ? '#FFF' : colors.mutedForeground }]}>
              Preview & Post
            </Text>
            <Feather name="arrow-right" size={18} color={canPreview ? '#FFF' : colors.mutedForeground} />
          </TouchableOpacity>

          {/* Secondary actions: Save Draft + Schedule */}
          <View style={styles.secondaryActions}>
            <TouchableOpacity
              onPress={handleSaveDraft}
              disabled={!canSaveDraft || isSavingDraft}
              activeOpacity={0.8}
              style={[styles.secondaryBtn, {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: canSaveDraft ? 1 : 0.45,
              }]}
            >
              <Feather name="save" size={15} color={colors.foreground} />
              <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
                {isSavingDraft ? 'Saving…' : 'Save Draft'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowScheduleModal(true)}
              disabled={!canSaveDraft}
              activeOpacity={0.8}
              style={[styles.secondaryBtn, {
                backgroundColor: colors.card,
                borderColor: colors.primary + '55',
                opacity: canSaveDraft ? 1 : 0.45,
              }]}
            >
              <Feather name="clock" size={15} color={colors.primary} />
              <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Schedule</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Drafts section */}
      {drafts.length > 0 && (
        <>
          <View style={styles.draftsHeader}>
            <Feather name="file-text" size={14} color={colors.primary} />
            <Text style={[styles.draftsTitle, { color: colors.foreground }]}>
              Drafts & Scheduled ({drafts.length})
            </Text>
          </View>
          {drafts.map(draft => (
            <DraftCard
              key={draft.id}
              draft={draft}
              colors={colors}
              onLoad={() => handleLoadDraft(draft.id)}
              onDelete={() => handleDeleteDraft(draft.id)}
            />
          ))}
        </>
      )}

      <ScheduleModal
        visible={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSchedule={handleSchedule}
        selectedPlatforms={composedPost?.selectedPlatforms ?? []}
        platformSettings={settings.platforms as unknown as Record<string, { postEnabled: boolean; credentials: Record<string, unknown> }>}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 0,
    marginBottom: 4,
    gap: 10,
  },
  headerTitle: { flex: 1, fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  clearBtnText: { fontSize: 14, fontFamily: 'Inter_400Regular' },

  newPostRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  newPostBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
  },
  newPostBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  feedBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  feedBtnText: { fontSize: 14, fontFamily: 'Inter_500Medium' },

  originalCard: {
    borderRadius: 12, borderWidth: 1, padding: 14, gap: 6,
    borderLeftWidth: 3, borderLeftColor: '#6366F1',
  },
  originalHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  originalLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },
  originalAuthor: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  originalContent: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },

  editorCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  editor: { minHeight: 140, padding: 14, fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 23 },
  editorFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 8,
  },
  charCount: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  aiTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  aiTagText: { fontSize: 11, fontFamily: 'Inter_500Medium' },

  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  aiBtnIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  aiBtnText: { flex: 1 },
  aiBtnTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  aiBtnSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },

  section: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 12 },
  enableHint: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  previewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 14, marginTop: 4,
  },
  previewBtnText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },

  secondaryActions: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 13, borderRadius: 12, borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  draftsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingTop: 8, paddingBottom: 2,
  },
  draftsTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
