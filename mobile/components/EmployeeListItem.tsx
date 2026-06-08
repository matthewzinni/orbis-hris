import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmployeeRecord, employeeDisplayName, employeeStatusLabel } from '@/src/lib/employees';
import { orbisTheme } from '@/src/theme';

type Props = {
  employee: EmployeeRecord;
  onPress: () => void;
};

export function EmployeeListItem({ employee, onPress }: Props) {
  const status = employeeStatusLabel(employee.status);
  const isActive = status === 'ACTIVE';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.main}>
        <Text style={styles.name}>{employeeDisplayName(employee)}</Text>
        <Text style={styles.meta}>
          {employee.id}
          {employee.department ? ` · ${employee.department}` : ''}
        </Text>
      </View>
      <View style={styles.badges}>
        {employee.is_remote ? <Text style={styles.remoteBadge}>Remote</Text> : null}
        <Text style={[styles.statusBadge, !isActive && styles.statusInactive]}>{status}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: orbisTheme.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: orbisTheme.border,
  },
  rowPressed: {
    backgroundColor: orbisTheme.surfaceElevated,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: orbisTheme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    color: orbisTheme.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  badges: {
    alignItems: 'flex-end',
    gap: 6,
  },
  remoteBadge: {
    color: orbisTheme.remote,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusBadge: {
    color: orbisTheme.success,
    fontSize: 11,
    fontWeight: '700',
  },
  statusInactive: {
    color: orbisTheme.textMuted,
  },
});
