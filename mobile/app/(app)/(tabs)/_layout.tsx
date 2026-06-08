import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { orbisTheme } from '@/src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: orbisTheme.surface },
        headerTintColor: orbisTheme.text,
        tabBarStyle: {
          backgroundColor: orbisTheme.surface,
          borderTopColor: orbisTheme.border,
        },
        tabBarActiveTintColor: orbisTheme.accent,
        tabBarInactiveTintColor: orbisTheme.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Employees',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'person.3.fill', android: 'group', web: 'group' }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}
