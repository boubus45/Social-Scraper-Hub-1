import React, { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { PlatformDef } from '@/types';

interface Props {
  platform: PlatformDef;
  content: string;
  onContentChange: (text: string) => void;
  isEdited: boolean;
}

export default function PlatformPreviewCard({ platform, content, onContentChange, isEdited }: Props) {
  const colors = useColors();
  const [isPosted, setIsPosted] = useState(false);
  const charCount = content.length;
  const charLimit = platform.charLimit;
  const remaining = charLimit - charCount;
  const isOverLimit = remaining < 0;
  const isNearLimit = remaining >= 0 && remaining < charLimit * 0.1;

  const countColor = isOverLimit ? colors.destructive : isNearLimit ? colors.warning : colors.mutedForeground;

  const handleOpenPlatform = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = platform.webUrl ?? '';
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) Linking.openURL(url);
    else Alert.alert('Cannot open', `Could not open ${platform.name}`);
  };

  const handleMarkPosted = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsPosted(prev => !prev);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: isPosted ? colors.success : colors.border }]}>
      {/* Platform header */}
      <View style={[styles.header, { backgroundColor: platform.bgColor }]}>
        <View style={styles.headerLeft}>
          <Feather name={platform.icon as any} size={16} color={platform.color} />
          <Text style={[styles.platformName, { color: platform.color }]}>{platform.name}</Text>
        </View>
        <View style={styles.headerRight}>
          {isEdited && (
            <View style={[styles.editedBadge, { borderColor: platform.color + '40' }]}>
              <Text style={[styles.editedText, { color: platform.color }]}>edited</Text>
            </View>
          )}
          {isPosted && (
            <View style={styles.postedBadge}>
              <Feather name="check-circle" size={14} color="#22C55E" />
            </View>
          )}
        </View>
      </View>

      {/* Content editor */}
      <TextInput
        style={[styles.editor, { color: colors.foreground }]}
        value={content}
        onChangeText={onContentChange}
        multiline
        textAlignVertical="top"
        placeholderTextColor={colors.mutedForeground}
        placeholder={`Write your ${platform.name} post...`}
      />

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.footerLeft}>
          <Text style={[styles.charCount, { color: countColor }]}>
            {isOverLimit ? `-${Math.abs(remaining)}` : remaining}
          </Text>
          <Text style={[styles.charTotal, { color: colors.mutedForeground }]}>
            / {charLimit.toLocaleString()}
          </Text>
        </View>
        <View style={styles.footerRight}>
          {!platform.hasApi && (
            <TouchableOpacity
              onPress={handleOpenPlatform}
              activeOpacity={0.8}
              style={[styles.openBtn, { borderColor: colors.border }]}
            >
              <Feather name="external-link" size={13} color={colors.mutedForeground} />
              <Text style={[styles.openBtnText, { color: colors.mutedForeground }]}>Open app</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleMarkPosted}
            activeOpacity={0.8}
            style={[
              styles.postedBtn,
              {
                backgroundColor: isPosted ? colors.success + '20' : colors.primary,
                borderColor: isPosted ? colors.success : 'transparent',
                borderWidth: isPosted ? 1 : 0,
              },
            ]}
          >
            <Feather
              name={isPosted ? 'check-circle' : (platform.hasApi ? 'send' : 'copy')}
              size={13}
              color={isPosted ? colors.success : '#FFFFFF'}
            />
            <Text style={[styles.postedBtnText, { color: isPosted ? colors.success : '#FFFFFF' }]}>
              {isPosted ? 'Posted' : platform.hasApi ? 'Post now' : 'Copy & post'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  platformName: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editedBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  editedText: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
  postedBadge: {},
  editor: {
    minHeight: 100,
    padding: 14,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  charCount: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  charTotal: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  footerRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  openBtnText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  postedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  postedBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
