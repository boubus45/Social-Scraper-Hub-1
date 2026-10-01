import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';

interface HeaderAvatarProps {
  size?: number;
  onPress?: () => void;
}

export function HeaderAvatar({ size = 34, onPress }: HeaderAvatarProps) {
  const { settings, session } = useApp();
  const colors = useColors();

  // The account photo (Google or a locally picked one) wins; the initial falls
  // back to the account name, then the email, then the local profile.
  const avatarUri = session?.avatarUrl || settings.profile.avatarUri || null;
  const initial =
    session?.name?.trim()?.[0]?.toUpperCase()
    ?? session?.email?.[0]?.toUpperCase()
    ?? settings.profile.name?.trim()?.[0]?.toUpperCase()
    ?? '?';

  const inner = avatarUri ? (
    <Image
      source={{ uri: avatarUri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  ) : (
    <View
      style={[
        styles.placeholder,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.primary + '30',
        },
      ]}
    >
      <Text style={[styles.initial, { color: colors.primary, fontSize: size * 0.38 }]}>
        {initial}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: 'Inter_600SemiBold',
    includeFontPadding: false,
  },
});
