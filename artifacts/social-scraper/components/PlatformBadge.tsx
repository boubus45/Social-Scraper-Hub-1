import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PlatformId } from '@/types';
import { PLATFORMS } from '@/constants/platforms';

interface Props {
  platform: PlatformId;
  size?: 'sm' | 'md';
}

export default function PlatformBadge({ platform, size = 'sm' }: Props) {
  const def = PLATFORMS[platform];
  const iconSize = size === 'sm' ? 10 : 14;
  const fontSize = size === 'sm' ? 10 : 12;
  const paddingH = size === 'sm' ? 6 : 8;
  const paddingV = size === 'sm' ? 3 : 4;

  return (
    <View style={[styles.badge, { backgroundColor: def.bgColor, paddingHorizontal: paddingH, paddingVertical: paddingV }]}>
      <Feather name={def.icon as any} size={iconSize} color={def.color} />
      <Text style={[styles.text, { color: def.color, fontSize }]}>{def.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    gap: 4,
  },
  text: {
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
});
