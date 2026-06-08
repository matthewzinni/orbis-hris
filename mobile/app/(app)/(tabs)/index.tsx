import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EmployeeListItem } from '@/components/EmployeeListItem';
import {
  EmployeeRecord,
  fetchAllEmployees,
  filterEmployees,
  sortEmployeesByName,
} from '@/src/lib/employees';
import { orbisTheme } from '@/src/theme';

export default function EmployeesScreen() {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError('');

    try {
      const rows = sortEmployeesByName(await fetchAllEmployees());
      setEmployees(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load employees.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => filterEmployees(employees, query, activeOnly),
    [employees, query, activeOnly]
  );

  return (
    <View style={styles.screen}>
      <View style={styles.searchWrap}>
        <TextInput
          placeholder="Search name, ID, department…"
          placeholderTextColor={orbisTheme.textMuted}
          style={styles.search}
          value={query}
          onChangeText={setQuery}
        />
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Active only</Text>
          <Switch
            value={activeOnly}
            onValueChange={setActiveOnly}
            trackColor={{ false: orbisTheme.surfaceElevated, true: orbisTheme.accent }}
          />
        </View>
        <Text style={styles.count}>
          {visible.length} of {employees.length} employees
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={orbisTheme.accent} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={orbisTheme.accent}
            />
          }
          renderItem={({ item }) => (
            <EmployeeListItem
              employee={item}
              onPress={() =>
                router.push({
                  pathname: '/(app)/employee/[id]',
                  params: { id: String(item.id) },
                })
              }
            />
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.empty}>No employees match your filters.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: orbisTheme.background,
  },
  searchWrap: {
    padding: 16,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: orbisTheme.border,
    backgroundColor: orbisTheme.surface,
  },
  search: {
    backgroundColor: orbisTheme.surfaceElevated,
    borderWidth: 1,
    borderColor: orbisTheme.border,
    borderRadius: 12,
    color: orbisTheme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterLabel: {
    color: orbisTheme.text,
    fontSize: 15,
  },
  count: {
    color: orbisTheme.textMuted,
    fontSize: 13,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  error: {
    color: orbisTheme.danger,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: orbisTheme.accentSoft,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: orbisTheme.accent,
    fontWeight: '700',
  },
  empty: {
    color: orbisTheme.textMuted,
    fontSize: 15,
  },
});
