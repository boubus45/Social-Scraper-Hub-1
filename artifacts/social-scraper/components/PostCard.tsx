import React, { useRef, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
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
  return `${Math.floor(hrs / 24)}d`;
}

function formatCount(n?: number): string {
  if (!n) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

// Regex to detect URLs in text
const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)|(www\.[^\s<>"{}|\\^`[\]]+)/gi;

interface TextSegment {
  text: string;
  url?: string;
}

function parseTextWithUrls(text: string): TextSegment[] {
  if (!text) return [];
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    const url = match[0];
    const normalizedUrl = url.startsWith('www.') ? `https://${url}` : url;
    segments.push({ text: url, url: normalizedUrl });
    lastIndex = URL_REGEX.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments;
}

function ClickableText({ 
  text, 
  color, 
  primaryColor, 
  style 
}: { 
  text: string; 
  color: string; 
  primaryColor: string; 
  style?: any;
}) {
  const segments = parseTextWithUrls(text);
  
  if (segments.length === 0) return <Text style={style}>{text}</Text>;

  return (
    <Text style={style}>
      {segments.map((segment, i) => {
        if (segment.url) {
          return (
            <Text
              key={i}
              style={{ color: primaryColor }}
              onPress={() => Linking.openURL(segment.url!)}
            >
              {segment.text}
            </Text>
          );
        }
        return <Text key={i}>{segment.text}</Text>;
      })}
    </Text>
  );
}

interface Props {
  post: Post;
  onCompose: () => void;
  visible: boolean;
}

function MediaItem({
  item,
  onImagePress,
  visible,
  onFullscreenChange,
}: {
  item: { type: 'image' | 'video'; url: string };
  onImagePress: (url: string) => void;
  visible: boolean;
  onFullscreenChange: (active: boolean) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const videoRef = useRef<Video>(null);

  const togglePlayback = async () => {
    if (!videoRef.current) return;
    if (playing) {
      await videoRef.current.pauseAsync();
      setPlaying(false);
    } else {
      await videoRef.current.playAsync();
      setPlaying(true);
    }
  };

  const openFullscreen = () => {
    setFullscreen(true);
    onFullscreenChange(true);
  };

  const closeFullscreen = async () => {
    setFullscreen(false);
    onFullscreenChange(false);
    await ScreenOrientation.unlockAsync();
    setPlaying(false);
  };

  if (item.type === 'video') {
    return (
      <>
      <View style={styles.mediaFrame}>
        <Video
          ref={videoRef}
          source={{ uri: item.url }}
          style={styles.media}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={visible && playing}
          isLooping
          onPlaybackStatusUpdate={(s) => {
            if (s.isLoaded && !s.isPlaying && playing) {
              setPlaying(false);
            }
          }}
        />
        <TouchableOpacity
          style={styles.videoOverlay}
          onPress={togglePlayback}
          activeOpacity={0.9}
          accessibilityLabel={playing ? "Pause video" : "Play video"}
        >
          {!playing && (
            <View style={styles.playButton}>
              <Feather name="play" size={24} color="#FFF" />
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.fullscreenButton} onPress={openFullscreen} accessibilityLabel="Open video fullscreen">
          <Feather name="maximize-2" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
      <Modal visible={fullscreen} animationType="fade" onRequestClose={closeFullscreen}>
        <View style={styles.videoFullscreen}>
          <Video
            source={{ uri: item.url }}
            style={styles.fullscreenVideo}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            shouldPlay
            isLooping
          />
          <TouchableOpacity style={styles.closeVideoButton} onPress={closeFullscreen} accessibilityLabel="Close fullscreen video">
            <Feather name="x" size={24} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.rotateFullscreenButton} onPress={async () => {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
          }} accessibilityLabel="Rotate video to landscape">
            <Feather name="rotate-cw" size={19} color="#FFF" />
          </TouchableOpacity>
        </View>
      </Modal>
      </>
    );
  }
  return (
    <TouchableOpacity style={styles.mediaFrame} onPress={() => onImagePress(item.url)} activeOpacity={0.9}>
      <Image source={{ uri: item.url }} style={styles.media} resizeMode="cover" />
    </TouchableOpacity>
  );
}

export default function PostCard({ post, onCompose, visible }: Props) {
  const colors = useColors();
  const [detailVisible, setDetailVisible] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [textExpanded, setTextExpanded] = useState(false);
  const [anyFullscreen, setAnyFullscreen] = useState(false);
  const media = (() => {
    const items = post.mediaItems ?? (post.media ?? []).map(url => ({ type: 'image' as const, url }));
    if (items.some(item => item.type === 'video')) {
      return items.filter(item => item.type === 'video');
    }
    return items;
  })();

  const openOriginal = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Linking.openURL(post.url);
  };

  const isLongPost = post.content.length > 180;
  const renderPostContent = (full: boolean) => {
    const expanded = full || textExpanded;
    const content = expanded || !isLongPost ? post.content : `${post.content.slice(0, 180).trimEnd()}…`;
    return (
      <View>
        {content ? (
          <ClickableText
            text={content}
            color={colors.foreground}
            primaryColor={colors.primary}
            style={[styles.content, { color: colors.foreground }]}
          />
        ) : null}
        {!full && isLongPost && (
          <Text style={[styles.expandHint, { color: colors.primary }]}>
            {expanded ? '- Collapse' : '+ Expand'}
          </Text>
        )}
      </View>
    );
  };

  return (
    <>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: post.isOfficial ? colors.warning : post.isNew ? colors.primary : colors.border, borderLeftWidth: post.isOfficial || post.isNew ? 3 : 1 }]}>
        <TouchableOpacity onPress={() => setDetailVisible(true)} activeOpacity={0.8}>
          <View style={styles.header}>
            <View style={styles.authorRow}>
              <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.avatarText, { color: colors.mutedForeground }]}>{post.authorHandle?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={styles.authorInfo}>
                <Text style={[styles.author, { color: colors.foreground }]} numberOfLines={1}>{post.author}</Text>
                <Text style={[styles.handle, { color: colors.mutedForeground }]} numberOfLines={1}>{post.authorHandle} · {formatRelativeTime(post.timestamp)}</Text>
              </View>
            </View>
            <View style={styles.badges}>
              {post.isNew && <Text style={[styles.badgeText, { color: colors.primary }]}>NEW</Text>}
              {post.isOfficial && <Text style={[styles.badgeText, { color: colors.warning }]}>SOURCE</Text>}
              <PlatformBadge platform={post.platform} size="sm" />
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setDetailVisible(true)} activeOpacity={0.8}>
          {renderPostContent(false)}
        </TouchableOpacity>

        <View style={styles.mediaGrid}>
          {media.slice(0, 4).map((item, index) => (
            <MediaItem
              key={`${item.url}-${index}`}
              item={item}
              onImagePress={setImageUrl}
              visible={visible && !anyFullscreen}
              onFullscreenChange={setAnyFullscreen}
            />
          ))}
        </View>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <View style={styles.statsRow}>
            {post.likes !== undefined && <Text style={[styles.statText, { color: colors.mutedForeground }]}>♥ {formatCount(post.likes)}</Text>}
            {post.comments !== undefined && <Text style={[styles.statText, { color: colors.mutedForeground }]}>◯ {formatCount(post.comments)}</Text>}
          </View>
          <View style={styles.footerActions}>
            <TouchableOpacity onPress={openOriginal} style={[styles.actionButton, { borderColor: colors.border }]}>
              <Feather name="external-link" size={13} color={colors.mutedForeground} />
              <Text style={[styles.actionText, { color: colors.mutedForeground }]}>See in app</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCompose} style={[styles.composeBtn, { backgroundColor: colors.primary }]}>
              <Feather name="edit-2" size={13} color="#FFF" />
              <Text style={styles.composeBtnText}>Compose</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={detailVisible} animationType="slide" transparent onRequestClose={() => setDetailVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.detailModal, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{post.authorHandle}</Text>
              <TouchableOpacity onPress={() => setDetailVisible(false)}><Feather name="x" size={24} color={colors.foreground} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.detailContent}>
              {renderPostContent(true)}
              {media.map((item, index) => (
                <MediaItem
                  key={`detail-${item.url}-${index}`}
                  item={item}
                  onImagePress={setImageUrl}
                  visible={true}
                  onFullscreenChange={setAnyFullscreen}
                />
              ))}
            </ScrollView>
            <TouchableOpacity onPress={openOriginal} style={[styles.openButton, { backgroundColor: colors.primary }]}>
              <Feather name="external-link" size={15} color="#FFF" />
              <Text style={styles.composeBtnText}>See in app</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(imageUrl)} transparent animationType="fade" onRequestClose={() => setImageUrl(null)}>
        <View style={styles.imageModal}>
          <TouchableOpacity style={styles.closeImageButton} onPress={() => setImageUrl(null)} accessibilityLabel="Close fullscreen image">
            <Feather name="x" size={24} color="#FFF" />
          </TouchableOpacity>
          {imageUrl && <Image source={{ uri: imageUrl }} style={styles.fullImage} resizeMode="contain" />}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  authorInfo: { flex: 1 },
  author: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  handle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  badgeText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  content: { fontSize: 14, lineHeight: 21, marginTop: 10 },
  expandHint: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 5 },
  mediaGrid: { gap: 8 },
  mediaFrame: { width: '100%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: '#252538' },
  media: { width: '100%', height: '100%' },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#000A', alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },
  fullscreenButton: { position: 'absolute', right: 10, bottom: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: '#000A', alignItems: 'center', justifyContent: 'center' },
  videoFullscreen: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  fullscreenVideo: { width: '100%', height: '100%' },
  closeVideoButton: { position: 'absolute', top: 28, right: 18, width: 42, height: 42, borderRadius: 21, backgroundColor: '#000A', alignItems: 'center', justifyContent: 'center' },
  rotateFullscreenButton: { position: 'absolute', right: 18, bottom: 34, width: 42, height: 42, borderRadius: 21, backgroundColor: '#000A', alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 10, gap: 8 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  footerActions: { flexDirection: 'row', gap: 6 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 18, borderWidth: 1 },
  actionText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  composeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18 },
  composeBtnText: { color: '#FFF', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  modalBackdrop: { flex: 1, backgroundColor: '#000B', justifyContent: 'flex-end' },
  detailModal: { maxHeight: '90%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  detailContent: { gap: 12, paddingBottom: 12 },
  openButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 20, paddingVertical: 11 },
  imageModal: { flex: 1, backgroundColor: '#000E', alignItems: 'center', justifyContent: 'center' },
  closeImageButton: { position: 'absolute', top: 48, right: 20, zIndex: 1, width: 42, height: 42, borderRadius: 21, backgroundColor: '#000A', alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '80%' },
});
