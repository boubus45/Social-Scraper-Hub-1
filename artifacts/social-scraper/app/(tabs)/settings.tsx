import React, { useRef, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
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
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import PlatformBadge from '@/components/PlatformBadge';
import { PLATFORM_LIST } from '@/constants/platforms';
import { PlatformCredentials, PlatformId } from '@/types';
import { API_BASE_URL } from '@/lib/apiConfig';
import { authHeaders, currentUserId } from '@/lib/authSession';
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from '@/types/subscription';

// OAuth configuration for each platform
const OAUTH_CONFIG: Record<PlatformId, {
  label: string;
  authUrl: string;
  clientIdEnv: string; // env var name holding the client ID
  redirectUri: string;
  scopes: string[];
  usePkce?: boolean; // Twitter/PKCE flow
} | null> = {
  x: {
    label: 'X (Twitter)',
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    clientIdEnv: 'X_OAUTH_CLIENT_ID',
    redirectUri: 'socialscraper://oauth/x',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    usePkce: true,
  },
  reddit: {
    label: 'Reddit',
    authUrl: 'https://www.reddit.com/api/v1/authorize',
    clientIdEnv: 'REDDIT_OAUTH_CLIENT_ID',
    redirectUri: 'socialscraper://oauth/reddit',
    scopes: ['read', 'identity', 'submit'],
    usePkce: false,
  },
  linkedin: {
    label: 'LinkedIn',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    clientIdEnv: 'LINKEDIN_OAUTH_CLIENT_ID',
    redirectUri: 'socialscraper://oauth/linkedin',
    scopes: ['openid', 'profile', 'email', 'w_member_social'],
    usePkce: false,
  },
  facebook: {
    label: 'Facebook',
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    clientIdEnv: 'FACEBOOK_OAUTH_CLIENT_ID',
    redirectUri: 'socialscraper://oauth/facebook',
    scopes: ['public_profile', 'email', 'pages_read_engagement'],
    usePkce: false,
  },
  instagram: {
    label: 'Instagram',
    authUrl: 'https://api.instagram.com/oauth/authorize',
    clientIdEnv: 'INSTAGRAM_OAUTH_CLIENT_ID',
    redirectUri: 'socialscraper://oauth/instagram',
    scopes: ['user_profile', 'user_media'],
    usePkce: false,
  },
  tiktok: null,
};

/** Plan names as the account sees them, under their email. */
const PLAN_LABELS: Record<SubscriptionTier, string> = {
  free: 'Free',
  pro: 'Pro',
  'mega-pro': 'Mega Pro',
  admin: 'Admin',
};

// Generate PKCE code verifier and challenge
async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = Array.from({ length: 64 }, () =>
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[
      Math.floor(Math.random() * 66)
    ]
  ).join('');

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { verifier, challenge };
}

async function handleOAuthLogin(platform: PlatformId): Promise<void> {
  const config = OAUTH_CONFIG[platform];
  if (!config) return;

  const baseUrl = API_BASE_URL.replace(/\/api$/, "");

  try {
    // Fetch the auth URL from backend (which knows the client ID)
    const authUrlRes = await fetch(`${baseUrl}/api/oauth/${platform}/auth-url`, {
      headers: await authHeaders(),
    });
    if (!authUrlRes.ok) {
      const err = await authUrlRes.text();
      Alert.alert('Error', err || `OAuth not configured for ${config.label}`);
      return;
    }
    const { url, redirectUri } = await authUrlRes.json() as { url: string; redirectUri: string };

    let codeVerifier: string | undefined;

    let authUrl = new URL(url);
    if (config.usePkce) {
      const pkce = await generatePkce();
      codeVerifier = pkce.verifier;
      // Append PKCE params to the auth URL
      authUrl.searchParams.set('code_challenge', pkce.challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
    }

    // Open the auth session
    const result = await WebBrowser.openAuthSessionAsync(authUrl.toString(), redirectUri);

    if (result.type === 'success' && result.url) {
      // Extract code from redirect URL
      const redirectUrl = new URL(result.url);
      const code = redirectUrl.searchParams.get('code');
      if (code) {
        // Send code to backend for token exchange
        const callbackRes = await fetch(`${baseUrl}/api/oauth/${platform}/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({
            code,
            userId: currentUserId() ?? 'local-user',
            codeVerifier,
          }),
        });

        if (callbackRes.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert('Success', `Connected to ${config.label}!`);
        } else {
          const error = await callbackRes.text();
          Alert.alert('Error', `Failed to connect: ${error}`);
        }
      }
    }
  } catch (error) {
    Alert.alert('Error', `Failed to open ${config.label} login. ${error instanceof Error ? error.message : ''}`);
  }
}

function hasOAuthCredentials(platform: PlatformId, credentials: PlatformCredentials): boolean {
  // This is now a fallback for manual credential mode.
  // Primary connection state comes from the backend OAuth store.
  switch (platform) {
    case 'x':
      return !!(credentials.bearerToken || credentials.accessToken);
    case 'reddit':
      return !!(credentials.clientId && credentials.clientSecret);
    case 'linkedin':
      return !!credentials.accessToken;
    case 'facebook':
      return !!(credentials.accessToken || credentials.cookies);
    case 'instagram':
      return !!(credentials.accessToken || credentials.cookies);
    default:
      return false;
  }
}

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
  const { settings, updateSettings, updatePlatformSettings, session, updateAccountName, signOut } = useApp();
  const [expandedPlatform, setExpandedPlatform] = useState<PlatformId | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  // ─── Identity (read-only account card) ───────────────────────────────────
  // Photo: account avatar (Google) or a locally picked one, either wins.
  const avatarUri = session?.avatarUrl || settings.profile.avatarUri || null;
  const email = session?.email ?? '';
  const tier = (session?.tier ?? settings.subscriptionTier) as SubscriptionTier;
  const planLabel = PLAN_LABELS[tier] ?? 'Free';
  // Name from the social account that created the profile; email-only accounts
  // have none, so only the email is shown until they add one.
  const accountName = session?.name?.trim() || '';
  const displayName = accountName || email.split('@')[0] || 'Your account';

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

  const startEditName = () => {
    setNameDraft(accountName);
    setEditingName(true);
  };

  const cancelEditName = () => {
    setEditingName(false);
    setNameDraft('');
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    setSavingName(true);
    try {
      await updateAccountName(trimmed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingName(false);
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSavingName(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You will need a new email code to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          void signOut();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
    >
      {/* ── Identity: photo, name, email, plan ── */}
      <View style={[styles.profileHero, { paddingTop: topPad + 20 }]}>
        <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8} style={styles.avatarWrap}>
          <View style={[styles.avatarOuter, { borderColor: colors.primary + '60' }]}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
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

        {/* Editable name */}
        {editingName ? (
          <View style={styles.nameEditRow}>
            <TextInput
              style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Your name"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveName}
              editable={!savingName}
            />
            <TouchableOpacity onPress={saveName} disabled={savingName} style={styles.nameEditBtn} hitSlop={8}>
              <Feather name="check" size={16} color={colors.success} />
            </TouchableOpacity>
            <TouchableOpacity onPress={cancelEditName} disabled={savingName} style={styles.nameEditBtn} hitSlop={8}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={startEditName} activeOpacity={0.7} style={styles.nameTapTarget}>
            <Text style={[styles.heroName, { color: colors.foreground }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Feather name="edit-2" size={13} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}

        {accountName && email ? (
          <Text style={[styles.heroHandle, { color: colors.mutedForeground }]} numberOfLines={1}>
            {email}
          </Text>
        ) : null}

        {/* Plan under email */}
        <Text style={[styles.planLabel, { color: colors.primary }]}>
          {planLabel}
        </Text>
      </View>

      {/* ── AI features ── */}
      <SectionHeader title="AI Features" icon="zap" />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.monitoringNote, { color: colors.mutedForeground }]}>
          AI rewriting will be provided by Social Scraper Hub. No provider selection or API key is required.
        </Text>
      </View>

      {/* ── Social Networks ── */}
      <SectionHeader title="Social Networks" icon="globe" />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {PLATFORM_LIST.map((platform, idx) => {
          const pSettings = settings.platforms[platform.id];
          const isExpanded = expandedPlatform === platform.id;
          const isLast = idx === PLATFORM_LIST.length - 1;

          return (
            <View key={platform.id} >
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
                  </View>
                </View>
                <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>

              {/* Expanded details */}
              {isExpanded && (
                <View style={[styles.platformDetails, { borderBottomColor: isLast ? 'transparent' : colors.border }]}>

                  {/* OAuth Connection Button */}
                  <View style={styles.oauthSection}>
                    <Text style={[styles.monitoringLabel, { color: colors.foreground }]}>
                      Account Connection
                    </Text>
                    {hasOAuthCredentials(platform.id, pSettings.credentials) ? (
                      <View style={styles.oauthConnectedRow}>
                        <Feather name="check-circle" size={16} color={colors.success} />
                        <Text style={[styles.oauthConnectedText, { color: colors.success }]}>
                          Connected
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            updatePlatformSettings(platform.id, { credentials: {} });
                          }}
                          style={[styles.disconnectBtn, { borderColor: colors.border }]}
                        >
                          <Text style={[styles.disconnectText, { color: colors.destructive }]}>Disconnect</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleOAuthLogin(platform.id)}
                        style={[styles.oauthButton, { backgroundColor: platform.bgColor }]}
                      >
                        <Feather name="link" size={14} color="#FFF" />
                        <Text style={styles.oauthButtonText}>Connect with {platform.name}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Followed accounts */}
                  <Text style={[styles.monitoringLabel, { color: colors.foreground }]}>
                    Monitoring accounts
                  </Text>
                  <Text style={[styles.inputLabel, { color: colors.mutedForeground, marginTop: 12 }]}>
                    {platform.id === 'reddit'
                      ? 'Subreddits / u/usernames — press ; or , to add'
                      : 'Accounts to follow — press ; or , to add'}
                  </Text>
                  <TagInput
                    tags={pSettings.followedAccounts}
                    onChange={tags => updatePlatformSettings(platform.id, {
                      followedAccounts: tags,
                      ...(platform.id === 'instagram' && tags.length > 0 ? { fetchEnabled: true } : {}),
                    })}
                     placeholder={platform.id === 'reddit' ? 'r/unsloth, u/hermesagent…' : '@username1…'}
                    colors={colors}
                  />

                  <Text style={[styles.monitoringHint, { color: colors.mutedForeground }]}>
                    New posts will be collected by the Social Scraper Hub monitor.
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* ── Sign out ── */}
      <TouchableOpacity
        onPress={handleSignOut}
        activeOpacity={0.85}
        style={[styles.signOutBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Feather name="log-out" size={16} color={colors.destructive} />
        <Text style={[styles.signOutText, { color: colors.destructive }]}>Sign out</Text>
      </TouchableOpacity>

      {/* User ID */}
      <Text style={[styles.userId, { color: colors.mutedForeground }]}>
        User ID: {session?.id ?? '—'}
      </Text>
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
    if (nativeEvent.key === 'Enter' || nativeEvent.key === 'Return') {
      commitCurrent(inputValue);
      return;
    }
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
  nameTapTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  heroName: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  nameInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    minWidth: 180,
  },
  nameEditBtn: {
    padding: 4,
  },
  heroHandle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  planLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 2,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
  },
  signOutText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  userId: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 12,
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
  monitoringNote: { fontSize: 13, lineHeight: 19 },
  monitoringLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  monitoringHint: { fontSize: 12, lineHeight: 17 },

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
  oauthSection: {
    marginBottom: 16,
    gap: 8,
  },
  oauthConnectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  oauthConnectedText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  disconnectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  disconnectText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  oauthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  oauthButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});