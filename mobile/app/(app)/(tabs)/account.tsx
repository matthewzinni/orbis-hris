import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/src/context/AuthContext';
import { orbisTheme } from '@/src/theme';

export default function AccountScreen() {
  const router = useRouter();
  const { displayName, email, role, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.name}>{displayName || email}</Text>
        <Text style={styles.meta}>{email}</Text>
        <Text style={styles.role}>Role: {role || '—'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.phaseTitle}>Phase 0 scope</Text>
        <Text style={styles.phaseBody}>
          Admin-only mobile roster: browse and view employee records. Editing, attendance, and
          supervisor access will ship in later phases.
        </Text>
      </View>

      <Pressable
        onPress={() => void handleSignOut()}
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: orbisTheme.background,
    padding: 16,
    gap: 14,
  },
  card: {
    backgroundColor: orbisTheme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: orbisTheme.border,
    padding: 16,
  },
  label: {
    color: orbisTheme.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  name: {
    color: orbisTheme.text,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 6,
  },
  meta: {
    color: orbisTheme.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  role: {
    color: orbisTheme.accent,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  phaseTitle: {
    color: orbisTheme.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  phaseBody: {
    color: orbisTheme.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  signOut: {
    alignItems: 'center',
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
    paddingVertical: 14,
  },
  signOutPressed: {
    opacity: 0.85,
  },
  signOutText: {
    color: orbisTheme.danger,
    fontSize: 16,
    fontWeight: '700',
  },
});
