import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { PlatformId } from '@/types';
import { PLATFORM_LIST } from '@/constants/platforms';

interface Props {
  selected: PlatformId[];
  onToggle: (platform: PlatformId) => void;
  label?: string;
  enabledOnly?: boolean;
  enabledPlatforms?: PlatformId[];
}

export default function PlatformSelector({ selected, onToggle, label, enabledOnly, enabledPlatforms }: Props) {
  const colors = useColors();

  const platforms = enabledOnly && enabledPlatforms
    ? PLATFORM_LIST.filter(p => enabledPlatforms.includes(p.id))
    : PLATFORM_LIST;

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {platforms.map(platform => {
          const isSelected = selected.includes(platform.id);
          return (
            <TouchableOpacity
              key={platform.id}
              onPress={() => onToggle(platform.id)}
              activeOpacity={0.75}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected ? platform.bgColor : colors.card,
                  borderColor: isSelected ? platform.bgColor : colors.border,
                },
              ]}
            >
              <Feather
                name={platform.icon as any}
                size={14}
                color={isSelected ? platform.color : colors.mutedForeground}
              />
              <Text style={[styles.chipText, { color: isSelected ? platform.color : colors.mutedForeground }]}>
                {platform.name}
              </Text>
              {isSelected && (
                <View style={styles.checkDot}>
                  <Feather name="check" size={9} color={platform.color} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  scroll: { gap: 8, paddingRight: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  checkDot: {
    marginLeft: 2,
  },
});
