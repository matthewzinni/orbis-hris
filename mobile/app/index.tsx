import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/src/context/AuthContext';
import { orbisTheme } from '@/src/theme';

export default function IndexScreen() {
  const { loading, session, isAdmin } = useAuth();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={orbisTheme.accent} size="large" />
      </View>
    );
  }

  if (session && isAdmin) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: orbisTheme.background,
  },
});
