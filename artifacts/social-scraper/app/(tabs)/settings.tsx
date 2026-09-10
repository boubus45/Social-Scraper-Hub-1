import React, { useRef, useState } from 'react';
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
import {
  AI_MODELS,
  AI_PROVIDER_LABELS,
  AIProvider,
  FETCH_FREQUENCY_LABELS,
  FetchFrequency,
  PlatformCredentials,
  PlatformId,
} from '@/types';

// Platforms that support toggling API vs manual mode
const API_TOGGLE_PLATFORMS: PlatformId[] = ['x', 'reddit'];

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <Feather name={icon as any} size={14} color={colors.primary} />
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
    </View>
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
      {/* ── Profile Hero (no top-left icon, big centered avatar) ── */}
      <View style={[styles.profileHero, { paddingTop: topPad + 20 }]}>
        <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8} style={styles.avatarWrap}>
          <View style={[styles.avatarOuter, { borderColor: colors.primary + '60' }]}>
            {settings.profile.avatarUri ? (
              <Image source={{ uri: settings.profile.avatarUri }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.secondary }]}>
                <Feather name="user" size={36} color={colors.mutedForeground} />
              </View>
            )}
          </View>
          <View style={[styles.cameraBtn, { backgroundColor: colors.primary }]}>
            <Feather name="camera" size={12} color="#FFF" />
          </View>
        </TouchableOpacity>

        <Text style={[styles.heroName, { color: colors.foreground }]}>
          {settings.profile.name || 'Your Name'}
        </Text>
        <Text style={[styles.heroHandle, { color: colors.mutedForeground }]}>
          {settings.profile.handle || '@yourhandle'}
        </Text>
        {settings.profile.bio ? (
          <Text style={[styles.heroBio, { color: colors.mutedForeground }]} numberOfLines={2}>
            {settings.profile.bio}
          </Text>
        ) : null}
      </View>

      {/* Profile fields */}
      <SectionHeader title="Profile" icon="user" />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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

      {/* ── AI Model ── */}
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

      {/* ── Social Networks ── */}
      <SectionHeader title="Social Networks" icon="globe" />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {PLATFORM_LIST.map((platform, idx) => {
          const pSettings = settings.platforms[platform.id];
          const isExpanded = expandedPlatform === platform.id;
          const isLast = idx === PLATFORM_LIST.length - 1;
          const hasApiToggle = API_TOGGLE_PLATFORMS.includes(platform.id);
          const credentialsLocked = hasApiToggle && !pSettings.useApi;

          return (
            <View key={platform.id}>
              {/* Platform row */}
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setExpandedPlatform(isExpanded ? null : platform.id);
                }}
                style={[
                  styles.platformRow,
                  { borderBottomColor: isLast && !isExpanded ? 'transparent' : colors.border },
                ]}
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

              {/* Expanded details */}
              {isExpanded && (
                <View style={[styles.platformDetails, { borderBottomColor: isLast ? 'transparent' : colors.border }]}>

                  {/* API / Manual toggle — only for X and Reddit */}
                  {hasApiToggle && (
                    <View style={[styles.dataSourceRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                      <View style={styles.dataSourceInfo}>
                        <Text style={[styles.dataSourceLabel, { color: colors.foreground }]}>Data Source</Text>
                        <Text style={[styles.dataSourceSub, { color: colors.mutedForeground }]}>
                          {pSettings.useApi
                            ? 'Fetch & post via API (credentials required)'
                            : 'Manual — copy-paste / open app'}
                        </Text>
                      </View>
                      <View style={styles.dataSourceChips}>
                        <TouchableOpacity
                          onPress={() => updatePlatformSettings(platform.id, { useApi: true })}
                          style={[
                            styles.modeChip,
                            {
                              backgroundColor: pSettings.useApi ? colors.primary : colors.card,
                              borderColor: pSettings.useApi ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Feather name="zap" size={11} color={pSettings.useApi ? '#FFF' : colors.mutedForeground} />
                          <Text style={[styles.modeChipText, { color: pSettings.useApi ? '#FFF' : colors.mutedForeground }]}>API</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => updatePlatformSettings(platform.id, { useApi: false })}
                          style={[
                            styles.modeChip,
                            {
                              backgroundColor: !pSettings.useApi ? colors.card : 'transparent',
                              borderColor: !pSettings.useApi ? colors.border : colors.border,
                            },
                          ]}
                        >
                          <Feather name="copy" size={11} color={!pSettings.useApi ? colors.foreground : colors.mutedForeground} />
                          <Text style={[styles.modeChipText, { color: !pSettings.useApi ? colors.foreground : colors.mutedForeground }]}>Manual</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Credentials — greyed & locked when manual mode selected */}
                  <View style={[
                    credentialsLocked ? styles.lockedSection : undefined,
                    credentialsLocked ? { pointerEvents: 'none' as const } : undefined,
                  ]}>
                    {credentialsLocked && (
                      <View style={[styles.lockedBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                        <Feather name="lock" size={11} color={colors.mutedForeground} />
                        <Text style={[styles.lockedText, { color: colors.mutedForeground }]}>
                          API credentials not needed in manual mode
                        </Text>
                      </View>
                    )}
                    <PlatformCredentialFields
                      platform={platform.id}
                      credentials={pSettings.credentials}
                      onUpdate={(creds: Partial<PlatformCredentials>) =>
                        updatePlatformSettings(platform.id, { credentials: { ...pSettings.credentials, ...creds } })
                      }
                      secureFields={secureFields}
                      toggleSecure={toggleSecure}
                      colors={colors}
                    />
                  </View>

                  {/* Followed accounts */}
                  <Text style={[styles.inputLabel, { color: colors.mutedForeground, marginTop: 12 }]}>
                    {platform.id === 'reddit'
                      ? 'Subreddits / u/usernames — press ; or , to add'
                      : 'Accounts to follow — press ; or , to add'}
                  </Text>
                  <TagInput
                    tags={pSettings.followedAccounts}
                    onChange={tags => updatePlatformSettings(platform.id, { followedAccounts: tags })}
                     placeholder={platform.id === 'reddit' ? 'r/unsloth, u/hermesagent…' : '@username1…'}
                    colors={colors}
                  />

                  {/* No-API note for LinkedIn/FB/IG */}
                  {!platform.hasApi && !hasApiToggle && (
                    <View style={[styles.noApiNote, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}>
                      <Feather name="info" size={12} color={colors.warning} />
                      <Text style={[styles.noApiText, { color: colors.warning }]}>
                        {platform.name} doesn't offer a public posting API. Posting will be manual.
                        Fetching uses HTTP with session cookies if provided.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* ── Preferences ── */}
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

// ─── Sub-components ───────────────────────────────────────────────────────

// ─── Tag / chip input ─────────────────────────────────────────────────────
function TagInput({
  tags,
  onChange,
  placeholder,
  colors,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  colors: ReturnType<typeof useColors>;
}) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<TextInput>(null);

  const commitCurrent = (raw: string) => {
    const trimmed = raw.trim().replace(/[,;]+$/, '').trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
  };

  const handleChangeText = (text: string) => {
    // Commit on ; or , typed anywhere in the string
    if (text.endsWith(';') || text.endsWith(',')) {
      commitCurrent(text);
      return;
    }
    setInputValue(text);
  };

  const handleKeyPress = ({ nativeEvent }: { nativeEvent: { key: string } }) => {
    if (nativeEvent.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => inputRef.current?.focus()}
      style={[styles.tagInputContainer, { borderColor: colors.border, backgroundColor: colors.secondary }]}
    >
      {tags.map((tag, i) => (
        <View key={i} style={[styles.tag, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '55' }]}>
          <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
          <TouchableOpacity onPress={() => removeTag(i)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}>
            <Feather name="x" size={11} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ))}
      <TextInput
        ref={inputRef}
        style={[styles.tagTextInput, { color: colors.foreground, minWidth: tags.length === 0 ? 120 : 80 }]}
        value={inputValue}
        onChangeText={handleChangeText}
        onKeyPress={handleKeyPress}
        onSubmitEditing={() => commitCurrent(inputValue)}
        placeholder={tags.length === 0 ? placeholder : '+ add…'}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={false}
        returnKeyType="done"
      />
    </TouchableOpacity>
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
          { key: 'bearerToken', label: 'Bearer Token', placeholder: 'AAA...', secure: true },
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
              onChangeText={v => onUpdate({ [field.key]: v } as Partial<PlatformCredentials>)}
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

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 8 },

  // Profile hero
  profileHero: {
    alignItems: 'center',
    paddingBottom: 24,
    gap: 6,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 4,
  },
  avatarOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2.5,
    overflow: 'visible',
  },
  avatarImg: {
    width: 83,
    height: 83,
    borderRadius: 41.5,
  },
  avatarPlaceholder: {
    width: 83,
    height: 83,
    borderRadius: 41.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0D0D14',
  },
  heroName: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  heroHandle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  heroBio: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 2,
    paddingHorizontal: 32,
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

  // Data source toggle
  dataSourceRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    marginBottom: 4,
  },
  dataSourceInfo: { gap: 2 },
  dataSourceLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  dataSourceSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  dataSourceChips: { flexDirection: 'row', gap: 8 },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  modeChipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  // Locked / greyed credentials
  lockedSection: { opacity: 0.38 },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  lockedText: { fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },

  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
  },
  platformMeta: { flex: 1 },
  platformToggles: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  toggleItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  platformDetails: {
    paddingTop: 4,
    paddingBottom: 16,
    gap: 8,
    borderBottomWidth: 1,
  },

  noApiNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  noApiText: { fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 17 },

  credRow: { gap: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowLabel: { flex: 1, gap: 2 },
  rowLabelText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  rowSublabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  rowValue: { fontSize: 14, fontFamily: 'Inter_400Regular', maxWidth: 160 },

  inputRow: { gap: 6, paddingVertical: 6 },
  inputLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  inlineInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    minHeight: 20,
  },
  eyeBtn: { padding: 4 },
  hint: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  optionChipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  divider: { height: 1, marginVertical: 4 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    position: 'relative',
  },
  avatarImage: { width: 60, height: 60, borderRadius: 30 },
  avatarEdit: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0D0D14',
  },
  avatarInfo: { flex: 1, gap: 3 },
  avatarName: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  avatarHandle: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  dividerLine: { height: 1, marginVertical: 4 },

  // Tag / chip input
  tagInputContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 6,
    gap: 6,
    minHeight: 42,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  tagTextInput: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 4,
    paddingHorizontal: 2,
    flex: 1,
  },
});
