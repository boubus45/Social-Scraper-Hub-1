import React from 'react';
import { Image, StyleSheet, TouchableOpacity } from 'react-native';

interface HeaderLogoProps {
  onPress?: () => void;
  size?: number;
}

export function HeaderLogo({ onPress, size = 32 }: HeaderLogoProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.wrapper}>
      <Image
        source={require('@/assets/images/icon.png')}
        resizeMode="cover"
        style={[styles.image, { width: size, height: size, borderRadius: size * 0.28 }]}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {},
});
