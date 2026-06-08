import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/src/context/AuthContext';
import { orbisTheme } from '@/src/theme';

export default function AppLayout() {
  const { loading, session, isAdmin } = useAuth();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={orbisTheme.accent} size="large" />
      </View>
    );
  }

  if (!session || !isAdmin) {
    return <Redirect href={session && !isAdmin ? '/login?denied=1' : '/login'} />;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="employee/[id]"
        options={{
          headerShown: true,
          title: 'Employee',
          headerStyle: { backgroundColor: orbisTheme.surface },
          headerTintColor: orbisTheme.text,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: orbisTheme.background,
  },
});
