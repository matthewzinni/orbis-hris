import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DetailRow } from '@/components/DetailRow';
import { formatBenefitsEligibilitySummary } from '@/src/lib/benefits';
import {
  EmployeeRecord,
  employeeDisplayName,
  employeeStatusLabel,
  fetchAllEmployees,
} from '@/src/lib/employees';
import { orbisTheme } from '@/src/theme';

function formatDate(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function EmployeeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError('');
      try {
        setEmployees(await fetchAllEmployees());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load employee.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const employee = useMemo(() => {
    const needle = String(id || '').trim().toLowerCase();
    return employees.find((row) => String(row.id).trim().toLowerCase() === needle);
  }, [employees, id]);

  const title = employee ? employeeDisplayName(employee) : 'Employee';

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={orbisTheme.accent} size="large" />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : !employee ? (
          <Text style={styles.error}>Employee not found.</Text>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroName}>{employeeDisplayName(employee)}</Text>
              <Text style={styles.heroMeta}>{employee.id}</Text>
              <View style={styles.heroBadges}>
                <Text style={styles.status}>{employeeStatusLabel(employee.status)}</Text>
                {employee.is_remote ? <Text style={styles.remote}>Remote</Text> : null}
              </View>
            </View>

            <View style={styles.card}>
              <DetailRow label="Department" value={String(employee.department || '')} />
              <DetailRow label="Position" value={String(employee.position || '')} />
              <DetailRow label="Supervisor" value={String(employee.supervisor || '')} />
              <DetailRow label="Work location" value={employee.is_remote ? 'Overseas / remote' : 'In house'} />
              <DetailRow label="Email" value={String(employee.email || '')} />
              <DetailRow label="Phone" value={String(employee.phone || '')} />
              <DetailRow label="Hire date" value={formatDate(employee.hire_date)} />
              <DetailRow label="Pay type" value={String(employee.pay_type || '')} />
              <DetailRow
                label="Standard hours"
                value={String(employee.standard_hours ?? '')}
              />
              <DetailRow label="Benefits" value={String(employee.benefits_status || '')} />
              <DetailRow
                label="Benefits eligibility"
                value={formatBenefitsEligibilitySummary(employee.hire_date)}
              />
              <DetailRow
                label="Next stay interview"
                value={formatDate(employee.next_review_date)}
              />
            </View>

            <Text style={styles.note}>
              Read-only in Phase 0. Use orbis-btw.com to edit records or run HR workflows.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: orbisTheme.background,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  hero: {
    backgroundColor: orbisTheme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: orbisTheme.border,
    padding: 16,
    marginBottom: 14,
  },
  heroName: {
    color: orbisTheme.text,
    fontSize: 24,
    fontWeight: '700',
  },
  heroMeta: {
    color: orbisTheme.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  heroBadges: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  status: {
    color: orbisTheme.success,
    fontSize: 12,
    fontWeight: '700',
  },
  remote: {
    color: orbisTheme.remote,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: orbisTheme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: orbisTheme.border,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  note: {
    color: orbisTheme.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  error: {
    color: orbisTheme.danger,
    fontSize: 15,
  },
});
