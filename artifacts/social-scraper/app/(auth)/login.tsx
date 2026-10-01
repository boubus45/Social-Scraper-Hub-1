import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { fetchGoogleAuthUrl } from '@/lib/authSession';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Social sign-in options. Google is wired to the backend (`/auth/google/…`) and
 * becomes usable the moment GOOGLE_CLIENT_ID/SECRET are configured; the rest
 * are shown staged until their own OAuth credentials exist.
 */
const STAGED_OPTIONS: Array<{ id: string; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { id: 'facebook', label: 'Facebook', icon: 'facebook' },
  { id: 'x', label: 'X', icon: 'twitter' },
  { id: 'instagram', label: 'Instagram', icon: 'instagram' },
  { id: 'tiktok', label: 'TikTok', icon: 'video' },
  { id: 'reddit', label: 'Reddit', icon: 'message-circle' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'linkedin' },
];

export default function LoginScreen() {
  const colors = useColors();
  const { requestCode, signInWithToken } = useApp();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const submit = async () => {
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      Alert.alert('Check that address', 'Enter a valid email address to receive your code.');
      return;
    }
    setBusy(true);
    try {
      const { delivery } = await requestCode(normalized);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      router.push({ pathname: '/(auth)/code', params: { email: normalized, delivery } });
    } catch (error) {
      Alert.alert(
        'Could not send the code',
        error instanceof Error ? error.message : 'Try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setGoogleBusy(true);
    try {
      const url = await fetchGoogleAuthUrl();
      const result = await WebBrowser.openAuthSessionAsync(url, 'social-scraper://auth');
      if (result.type !== 'success') return; // cancelled or dismissed
      const token = /[?&]token=([^&]+)/.exec(result.url)?.[1];
      if (token) {
        await signInWithToken(decodeURIComponent(token));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return;
      }
      const failure = /[?&]error=([^&]+)/.exec(result.url)?.[1];
      Alert.alert('Google sign-in', failure ? 'Google did not finish the sign-in. Try again.' : 'Google sign-in did not complete.');
    } catch (error) {
      Alert.alert(
        'Google sign-in',
        error instanceof Error ? error.message : 'Google sign-in is not available yet.',
      );
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <Image source={require('@/assets/images/icon.png')} style={styles.logo} />
          <Text style={[styles.title, { color: colors.foreground }]}>Social Scraper Hub</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in or create an account to open your feed.
          </Text>

          <Text style={[styles.label, { color: colors.mutedForeground }]}>EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
            ]}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!busy}
          />

          <TouchableOpacity
            onPress={submit}
            disabled={busy}
            activeOpacity={0.85}
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                Continue with email
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity
            onPress={signInWithGoogle}
            disabled={googleBusy}
            activeOpacity={0.85}
            style={[styles.googleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            {googleBusy ? (
              <ActivityIndicator color={colors.foreground} />
            ) : (
              <>
                <MaterialCommunityIcons name="google" size={18} color={colors.foreground} />
                <Text style={[styles.googleBtnText, { color: colors.foreground }]}>
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.stagedGrid}>
            {STAGED_OPTIONS.map(option => (
              <View
                key={option.id}
                style={[styles.stagedBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Feather name={option.icon} size={15} color={colors.mutedForeground} />
                <Text style={[styles.stagedText, { color: colors.mutedForeground }]}>
                  {option.label}
                </Text>
                <Text style={[styles.stagedBadge, { color: colors.mutedForeground }]}>soon</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
            New here? Enter your email — your account is created as soon as you confirm the code.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  logo: { width: 64, height: 64, borderRadius: 18, resizeMode: 'cover', alignSelf: 'center' },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    textAlign: 'center',
    marginTop: 16,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 21,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 30,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 15 : 12,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  primaryBtn: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  divider: { flex: 1, height: 1 },
  dividerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    marginHorizontal: 12,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 50,
  },
  googleBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  stagedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    justifyContent: 'center',
  },
  stagedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    opacity: 0.6,
  },
  stagedText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  stagedBadge: { fontFamily: 'Inter_500Medium', fontSize: 10, textTransform: 'uppercase' },
  footnote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 26,
    lineHeight: 19,
  },
});
