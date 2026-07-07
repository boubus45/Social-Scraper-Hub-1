import React, { useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import PlatformBadge from '@/components/PlatformBadge';
import { PLATFORM_LIST } from '@/constants/platforms';
import { AI_MODELS, AI_PROVIDER_LABELS, AIProvider, FETCH_FREQUENCY_LABELS, FetchFrequency, PlatformCredentials, PlatformId } from '@/types';

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <Feather name={icon as any} size={14} color={colors.primary} />
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
    </View>
  );
}

function SettingsRow({
  label, value, onPress, rightElement, sublabel,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  sublabel?: string;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <View style={styles.rowLabel}>
        <Text style={[styles.rowLabelText, { color: colors.foreground }]}>{label}</Text>
        {sublabel && <Text style={[styles.rowSublabel, { color: colors.mutedForeground }]}>{sublabel}</Text>}
      </View>
      {rightElement ?? (
        <Text style={[styles.rowValue, { color: colors.mutedForeground }]} numberOfLines={1}>
          {value}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, updatePlatformSettings } = useApp();
  const [expandedPlatform, setExpandedPlatform] = useState<PlatformId | null>(null);
  const [secureFields, setSecureFields] = useState<Record<string, boolean>>({});

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  const toggleSecure = (key: string) =>
    setSecureFields(prev => ({ ...prev, [key]: !prev[key] }));

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to set a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await updateSettings({ profile: { ...settings.profile, avatarUri: result.assets[0].uri } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const providers: AIProvider[] = ['openai', 'anthropic', 'gemini'];
  const models = AI_MODELS[settings.ai.provider];
  const frequencies: FetchFrequency[] = ['manual', '15min', '30min', '1h', '6h'];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
      </View>

      {/* Profile Section */}
      <SectionHeader title="Profile" icon="user" />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Avatar */}
        <TouchableOpacity onPress={handlePickAvatar} style={styles.avatarRow} activeOpacity={0.8}>
          <View style={[styles.avatarContainer, { borderColor: colors.primary + '60' }]}>
            {settings.profile.avatarUri ? (
              <Image source={{ uri: settings.profile.avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.secondary }]}>
                <Feather name="user" size={28} color={colors.mutedForeground} />
              </View>
            )}
            <View style={[styles.avatarEdit, { backgroundColor: colors.primary }]}>
              <Feather name="camera" size={10} color="#FFF" />
            </View>
          </View>
          <View style={styles.avatarInfo}>
            <Text style={[styles.avatarName, { color: colors.foreground }]}>
              {settings.profile.name || 'Your Name'}
            </Text>
            <Text style={[styles.avatarHandle, { color: colors.mutedForeground }]}>
              {settings.profile.handle || '@yourhandle'}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <InputRow
          label="Name"
          value={settings.profile.name}
          onChange={v => updateSettings({ profile: { ...settings.profile, name: v } })}
          placeholder="Your full name"
          colors={colors}
        />
        <InputRow
          label="Handle"
          value={settings.profile.handle}
          onChange={v => updateSettings({ profile: { ...settings.profile, handle: v } })}
          placeholder="@yourhandle"
          colors={colors}
        />
        <InputRow
          label="Bio"
          value={settings.profile.bio}
          onChange={v => updateSettings({ profile: { ...settings.profile, bio: v } })}
          placeholder="Short bio..."
          colors={colors}
          multiline
          last
        />
      </View>

      {/* AI Model Section */}
      <SectionHeader title="AI Model" icon="zap" />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Provider</Text>
        <View style={styles.chipRow}>
          {providers.map(p => (
            <TouchableOpacity
              key={p}
              onPress={() => updateSettings({ ai: { ...settings.ai, provider: p, model: AI_MODELS[p][0] } })}
              style={[
                styles.optionChip,
                {
                  backgroundColor: settings.ai.provider === p ? colors.primary : colors.secondary,
                  borderColor: settings.ai.provider === p ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.optionChipText, { color: settings.ai.provider === p ? '#FFF' : colors.mutedForeground }]}>
                {AI_PROVIDER_LABELS[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Model</Text>
        <View style={styles.chipRow}>
          {models.map(m => (
            <TouchableOpacity
              key={m}
              onPress={() => updateSettings({ ai: { ...settings.ai, model: m } })}
              style={[
                styles.optionChip,
                {
                  backgroundColor: settings.ai.model === m ? colors.primary : colors.secondary,
                  borderColor: settings.ai.model === m ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.optionChipText, { color: settings.ai.model === m ? '#FFF' : colors.mutedForeground }]}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>API Key</Text>
        <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
          <TextInput
            style={[styles.textInput, { color: colors.foreground }]}
            value={settings.ai.apiKey}
            onChangeText={v => updateSettings({ ai: { ...settings.ai, apiKey: v } })}
            placeholder="sk-..."
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={!secureFields['aiKey']}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => toggleSecure('aiKey')} style={styles.eyeBtn}>
            <Feather name={secureFields['aiKey'] ? 'eye' : 'eye-off'} size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Used for AI rephrasing. Never sent to our servers.
        </Text>
      </View>

      {/* Social Networks */}
      <SectionHeader title="Social Networks" icon="globe" />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {PLATFORM_LIST.map((platform, idx) => {
          const pSettings = settings.platforms[platform.id];
          const isExpanded = expandedPlatform === platform.id;
          const isLast = idx === PLATFORM_LIST.length - 1;

          return (
            <View key={platform.id}>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setExpandedPlatform(isExpanded ? null : platform.id);
                }}
                style={[styles.platformRow, { borderBottomColor: isLast && !isExpanded ? 'transparent' : colors.border }]}
                activeOpacity={0.7}
              >
                <PlatformBadge platform={platform.id} size="md" />
                <View style={styles.platformMeta}>
                  <View style={styles.platformToggles}>
                    <View style={styles.toggleItem}>
                      <Text style={[styles.toggleLabel, { color: colors.mutedForeground }]}>Fetch</Text>
                      <Switch
                        value={pSettings.fetchEnabled}
                        onValueChange={v => updatePlatformSettings(platform.id, { fetchEnabled: v })}
                        trackColor={{ false: colors.secondary, true: platform.bgColor }}
                        thumbColor="#FFF"
                        ios_backgroundColor={colors.secondary}
                      />
                    </View>
                    <View style={styles.toggleItem}>
                      <Text style={[styles.toggleLabel, { color: colors.mutedForeground }]}>Post</Text>
                      <Switch
                        value={pSettings.postEnabled}
                        onValueChange={v => updatePlatformSettings(platform.id, { postEnabled: v })}
                        trackColor={{ false: colors.secondary, true: platform.bgColor }}
                        thumbColor="#FFF"
                        ios_backgroundColor={colors.secondary}
                      />
                    </View>
                  </View>
                </View>
                <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>

              {isExpanded && (
                <View style={[styles.platformDetails, { borderBottomColor: isLast ? 'transparent' : colors.border }]}>
                  <PlatformCredentialFields
                    platform={platform.id}
                    credentials={pSettings.credentials}
                    onUpdate={(creds: Partial<PlatformCredentials>) => updatePlatformSettings(platform.id, { credentials: { ...pSettings.credentials, ...creds } })}
                    secureFields={secureFields}
                    toggleSecure={toggleSecure}
                    colors={colors}
                  />
                  <Text style={[styles.inputLabel, { color: colors.mutedForeground, marginTop: 12 }]}>
                    {platform.id === 'reddit' ? 'Subreddits / u/usernames (comma-separated)' : 'Accounts to follow (comma-separated)'}
                  </Text>
                  <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                    <TextInput
                      style={[styles.textInput, { color: colors.foreground }]}
                      value={pSettings.followedAccounts.join(', ')}
                      onChangeText={v => updatePlatformSettings(platform.id, {
                        followedAccounts: v.split(',').map(s => s.trim()).filter(Boolean),
                      })}
                      placeholder={platform.id === 'reddit' ? 'programming, technology, worldnews' : '@username1, @username2'}
                      placeholderTextColor={colors.mutedForeground}
                      autoCapitalize="none"
                    />
                  </View>
                  {!platform.hasApi && (
                    <View style={[styles.noApiNote, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}>
                      <Feather name="info" size={12} color={colors.warning} />
                      <Text style={[styles.noApiText, { color: colors.warning }]}>
                        {platform.name} doesn't offer a public API. Posting will be manual via the app.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Preferences */}
      <SectionHeader title="Preferences" icon="sliders" />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Auto-fetch frequency</Text>
        <View style={styles.chipRow}>
          {frequencies.map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => updateSettings({ fetchFrequency: f })}
              style={[
                styles.optionChip,
                {
                  backgroundColor: settings.fetchFrequency === f ? colors.primary : colors.secondary,
                  borderColor: settings.fetchFrequency === f ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.optionChipText, { color: settings.fetchFrequency === f ? '#FFF' : colors.mutedForeground }]}>
                {FETCH_FREQUENCY_LABELS[f]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function InputRow({
  label, value, onChange, placeholder, multiline, last, colors,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; multiline?: boolean; last?: boolean; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.inputRow, last ? {} : { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
      <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[styles.inlineInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        autoCapitalize="none"
      />
    </View>
  );
}

function PlatformCredentialFields({
  platform, credentials, onUpdate, secureFields, toggleSecure, colors,
}: {
  platform: PlatformId;
  credentials: PlatformCredentials;
  onUpdate: (patch: Partial<PlatformCredentials>) => void;
  secureFields: Record<string, boolean>;
  toggleSecure: (k: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const fields: Array<{ key: string; label: string; placeholder: string; secure?: boolean }> =
    platform === 'x'
      ? [
          { key: 'bearerToken', label: 'Bearer Token', placeholder: 'AAAA...', secure: true },
          { key: 'apiKey', label: 'API Key', placeholder: 'API key', secure: true },
          { key: 'apiSecret', label: 'API Secret', placeholder: 'API secret', secure: true },
          { key: 'accessToken', label: 'Access Token', placeholder: 'Access token', secure: true },
          { key: 'accessTokenSecret', label: 'Access Token Secret', placeholder: 'Access token secret', secure: true },
        ]
      : platform === 'reddit'
      ? [
          { key: 'clientId', label: 'Client ID', placeholder: 'Reddit app client ID' },
          { key: 'clientSecret', label: 'Client Secret', placeholder: 'Reddit app client secret', secure: true },
          { key: 'username', label: 'Username', placeholder: 'Reddit username' },
          { key: 'password', label: 'Password', placeholder: 'Reddit password', secure: true },
        ]
      : [
          { key: 'cookies', label: 'Session Cookies', placeholder: 'Paste session cookies (optional)', secure: true },
        ];

  return (
    <>
      {fields.map(field => (
        <View key={field.key} style={styles.credRow}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
          <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
            <TextInput
              style={[styles.textInput, { color: colors.foreground, flex: 1 }]}
              value={(credentials as Record<string, string | undefined>)[field.key] ?? ''}
              onChangeText={v => onUpdate({ [field.key]: v })}
              placeholder={field.placeholder}
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={field.secure && !secureFields[`${platform}_${field.key}`]}
              autoCapitalize="none"
            />
            {field.secure && (
              <TouchableOpacity onPress={() => toggleSecure(`${platform}_${field.key}`)} style={styles.eyeBtn}>
                <Feather
                  name={secureFields[`${platform}_${field.key}`] ? 'eye' : 'eye-off'}
                  size={14}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 8 },
  header: {
    paddingHorizontal: 4,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginBottom: 4,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    position: 'relative',
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEdit: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInfo: { flex: 1 },
  avatarName: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  avatarHandle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  divider: { height: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowLabel: { flex: 1 },
  rowLabelText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  rowSublabel: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  rowValue: { fontSize: 14, fontFamily: 'Inter_400Regular', maxWidth: 150 },
  inputRow: { gap: 6, paddingVertical: 8 },
  inputLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 0.5, textTransform: 'uppercase' },
  inlineInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  optionChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  hint: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  platformMeta: { flex: 1, alignItems: 'flex-end' },
  platformToggles: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  toggleItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  platformDetails: {
    paddingBottom: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  credRow: { gap: 4 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 8,
  },
  eyeBtn: { padding: 4 },
  noApiNote: {
    flexDirection: 'row',
    gap: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  noApiText: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 17 },
});
