import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppProvider, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

/** Small app-icon shown in stack screen header left */
function StackHeaderLogo() {
  return (
    <TouchableOpacity onPress={() => router.push('/')} activeOpacity={0.75} style={stackStyles.logoBtn}>
      <Image
        source={require('@/assets/images/icon.png')}
        style={stackStyles.logo}
      />
    </TouchableOpacity>
  );
}

/** Profile avatar shown in stack screen header right */
function StackHeaderAvatar() {
  const { settings } = useApp();
  const colors = useColors();
  const size = 32;

  return (
    <TouchableOpacity onPress={() => router.push('/settings')} activeOpacity={0.75} style={stackStyles.avatarBtn}>
      {settings.profile.avatarUri ? (
        <Image
          source={{ uri: settings.profile.avatarUri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <View
          style={[
            stackStyles.avatarPlaceholder,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary + '30' },
          ]}
        >
          <Text style={[stackStyles.avatarInitial, { color: colors.primary }]}>
            {settings.profile.name?.trim()?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0D0D14' },
        headerTintColor: '#F0F0FF',
        headerTitleStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 17 },
        contentStyle: { backgroundColor: '#0D0D14' },
        headerLeft: () => <StackHeaderLogo />,
        headerRight: () => <StackHeaderAvatar />,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="edit/[postId]"
        options={{ title: 'Compose Post', headerBackTitle: 'Feed' }}
      />
      <Stack.Screen
        name="preview/index"
        options={{ title: 'Preview & Post', headerBackTitle: 'Edit' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    // Explicitly load vector-icon fonts so they render on Android
    ...Feather.font,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AppProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const stackStyles = StyleSheet.create({
  logoBtn: { marginLeft: 4, padding: 2 },
  logo: { width: 28, height: 28, borderRadius: 8, resizeMode: 'cover' },
  avatarBtn: { marginRight: 4, padding: 2 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});
