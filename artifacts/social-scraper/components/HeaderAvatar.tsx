import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';

interface HeaderAvatarProps {
  size?: number;
  onPress?: () => void;
}

export function HeaderAvatar({ size = 34, onPress }: HeaderAvatarProps) {
  const { settings } = useApp();
  const colors = useColors();
  const initial = settings.profile.name?.trim()?.[0]?.toUpperCase() ?? '?';

  const inner = settings.profile.avatarUri ? (
    <Image
      source={{ uri: settings.profile.avatarUri }}
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
