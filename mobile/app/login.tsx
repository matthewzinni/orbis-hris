import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/src/context/AuthContext';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { orbisTheme } from '@/src/theme';

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ denied?: string }>();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const deniedMessage =
    params.denied === '1'
      ? 'Orbis Mobile Phase 0 is admin-only. Supervisor access comes in a later release.'
      : '';

  async function handleSignIn() {
    setError('');
    setSubmitting(true);

    try {
      const message = await signIn(email, password);
      if (message) {
        setError(message);
        return;
      }
      router.replace('/(app)/(tabs)');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.kicker}>BTW Global</Text>
        <Text style={styles.title}>Orbis Mobile</Text>
        <Text style={styles.subtitle}>Phase 0 · Admin roster</Text>

        {!isSupabaseConfigured ? (
          <Text style={styles.error}>
            Missing Supabase config. Copy mobile/.env.example to mobile/.env and set
            EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.
          </Text>
        ) : null}

        {deniedMessage ? <Text style={styles.error}>{deniedMessage}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@btwglobal.com"
          placeholderTextColor={orbisTheme.textMuted}
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          secureTextEntry
          autoCapitalize="none"
          placeholder="Password"
          placeholderTextColor={orbisTheme.textMuted}
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />

        <Pressable
          disabled={submitting || !isSupabaseConfigured}
          onPress={() => void handleSignIn()}
          style={({ pressed }) => [
            styles.button,
            (pressed || submitting) && styles.buttonPressed,
            (!isSupabaseConfigured || submitting) && styles.buttonDisabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        <Text style={styles.footer}>
          Use the same credentials as{' '}
          <Link href="https://www.orbis-btw.com" style={styles.link}>
            orbis-btw.com
          </Link>
          . Full HR workflows remain on the web app for now.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: orbisTheme.background,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: orbisTheme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: orbisTheme.border,
    padding: 22,
  },
  kicker: {
    color: orbisTheme.textMuted,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: orbisTheme.text,
    fontSize: 28,
    fontWeight: '700',
    marginTop: 4,
  },
  subtitle: {
    color: orbisTheme.textMuted,
    fontSize: 14,
    marginBottom: 18,
  },
  label: {
    color: orbisTheme.textMuted,
    fontSize: 12,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: orbisTheme.surfaceElevated,
    borderWidth: 1,
    borderColor: orbisTheme.border,
    borderRadius: 12,
    color: orbisTheme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    alignItems: 'center',
    backgroundColor: orbisTheme.accent,
    borderRadius: 12,
    marginTop: 18,
    paddingVertical: 14,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    color: orbisTheme.danger,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  footer: {
    color: orbisTheme.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 16,
  },
  link: {
    color: orbisTheme.accent,
  },
});
