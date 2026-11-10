import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';
import type { Customer } from '@/types/api';
import { Field } from './ui';

/**
 * Farmer name box with suggestions from existing farmers, so the same farmer is reused
 * instead of being added again. Picking a suggestion also fills the phone number.
 */
export function FarmerInput({
  name,
  customerId,
  onChange,
  error,
}: {
  name: string;
  customerId: string | null;
  onChange: (v: { name: string; customerId: string | null; phone?: string }) => void;
  error?: string;
}) {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [focused, setFocused] = useState(false);

  const q = name.trim();
  const searching = focused && q.length > 0 && !customerId;
  const visible = searching ? suggestions : [];

  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const id = setTimeout(() => {
      api
        .customers(q)
        .then((res) => !cancelled && setSuggestions(res.data))
        .catch(() => !cancelled && setSuggestions([]));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [q, searching]);

  return (
    <View>
      <Field
        label={t('farmerName')}
        value={name}
        onChangeText={(text) => onChange({ name: text, customerId: null })}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        autoCapitalize="words"
        error={error}
        hint={name.trim() ? (customerId ? `✓ ${t('existingFarmer')}` : t('newFarmer')) : undefined}
      />
      {visible.length > 0 ? (
        <View className="-mt-2 mb-4 overflow-hidden rounded-xl border-2 border-line bg-white">
          {visible.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => {
                onChange({ name: c.name, customerId: c.id, phone: c.phone });
                setSuggestions([]);
              }}
              className="border-b border-line px-4 py-3 active:bg-section"
            >
              <Text className="text-lg font-semibold text-ink">{c.name}</Text>
              {c.phone ? <Text className="text-base text-ink-soft">{c.phone}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
