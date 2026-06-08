import { StyleSheet, Text, View } from 'react-native';

import { orbisTheme } from '@/src/theme';

type Props = {
  label: string;
  value: string;
};

export function DetailRow({ label, value }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: orbisTheme.border,
  },
  label: {
    color: orbisTheme.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  value: {
    color: orbisTheme.text,
    fontSize: 16,
    lineHeight: 22,
  },
});
