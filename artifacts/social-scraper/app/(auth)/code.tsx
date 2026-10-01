import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';

const RESEND_COOLDOWN_S = 30;

export default function CodeScreen() {
  const colors = useColors();
  const { requestCode, verifyCode } = useApp();
  const params = useLocalSearchParams<{ email?: string; delivery?: string }>();
  const email = typeof params.email === 'string' ? params.email : '';

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [delivery, setDelivery] = useState<'email' | 'log'>(
    params.delivery === 'log' ? 'log' : 'email',
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submit = async () => {
    if (!/^\d{6}$/.test(code)) {
      setMessage('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await verifyCode(email, code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // The root layout sees the new session and moves to the feed.
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setMessage(error instanceof Error ? error.message : 'That code did not work.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await requestCode(email);
      setDelivery(result.delivery);
      setCode('');
      setCooldown(RESEND_COOLDOWN_S);
      Alert.alert('New code sent', 'Check your inbox for the latest code.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send a new code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.back, { backgroundColor: colors.card }]}
            hitSlop={10}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>

          <Text style={[styles.title, { color: colors.foreground }]}>Enter your code</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            We sent a 6-digit code to{'\n'}
            <Text style={[styles.email, { color: colors.foreground }]}>{email}</Text>
          </Text>

          <TextInput
            value={code}
            onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={colors.mutedForeground + '80'}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={6}
            editable={!busy}
            onSubmitEditing={submit}
            style={[
              styles.codeInput,
              {
                backgroundColor: colors.card,
                borderColor: code.length === 6 ? colors.primary : colors.border,
                color: colors.foreground,
              },
            ]}
          />

          {delivery === 'log' ? (
            <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="info" size={15} color={colors.warning} />
              <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
                Email delivery is not switched on yet, so this code was printed in the backend log
                instead. Once BREVO_API_KEY is set, codes arrive by email.
              </Text>
            </View>
          ) : null}

          {message ? (
            <Text style={[styles.error, { color: colors.destructive }]}>{message}</Text>
          ) : null}

          <TouchableOpacity
            onPress={submit}
            disabled={busy}
            activeOpacity={0.85}
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.primary, opacity: busy || code.length < 6 ? 0.6 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                Verify & open feed
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.resendRow}>
            <Text style={[styles.resendText, { color: colors.mutedForeground }]}>
              Didn't get it?
            </Text>
            <TouchableOpacity onPress={resend} disabled={cooldown > 0 || busy} hitSlop={8}>
              <Text
                style={[
                  styles.resendLink,
                  { color: cooldown > 0 ? colors.mutedForeground : colors.primary },
                ]}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.changeEmail}>
            <Text style={[styles.changeEmailText, { color: colors.mutedForeground }]}>
              Use a different email
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
  back: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: 'Inter_700Bold', fontSize: 24, marginTop: 28 },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  email: { fontFamily: 'Inter_600SemiBold' },
  codeInput: {
    marginTop: 28,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: Platform.OS === 'ios' ? 18 : 14,
    fontSize: 30,
    letterSpacing: 12,
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
  },
  notice: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  noticeText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 14, marginTop: 14, lineHeight: 20 },
  primaryBtn: {
    marginTop: 22,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
  },
  resendText: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  resendLink: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  changeEmail: { alignSelf: 'center', marginTop: 14 },
  changeEmailText: { fontFamily: 'Inter_500Medium', fontSize: 14 },
});
