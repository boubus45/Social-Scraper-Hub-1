import React from 'react';
import { Stack } from 'expo-router';

/**
 * The screens shown before sign-in. The root layout decides who lands here:
 * signed-out users are redirected to `login` as soon as the stored session has
 * been read, and this group renders with no header so it reads as its own flow.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0D0D14' },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="code" />
    </Stack>
  );
}
