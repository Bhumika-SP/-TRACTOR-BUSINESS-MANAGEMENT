import { router } from 'expo-router';
import { ChevronRight, LogOut, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { DateField } from '@/components/pickers';
import { useToast } from '@/components/Toast';
import { Button, Card, Chips, ErrorView, Field, LoadingView, Notice, Screen, Section } from '@/components/ui';
import { API_URL, COLORS } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useQuery } from '@/hooks/useQuery';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';
import { parseAmount } from '@/utils/format';

/** Language (every user), business rates and users (owner only), log out. */
export default function SettingsScreen() {
  const { t, lang, setLang } = useI18n();
  const { user, isAdmin, logout } = useAuth();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const q = useQuery('settings', () => api.settings());
  const [form, setForm] = useState({ businessName: '', tractorHourlyRate: '', driverHourlyRate: '', driverName: '', paymentCycleStartDate: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fill the form whenever fresh settings arrive.
  const [loadedFrom, setLoadedFrom] = useState(q.data);
  if (q.data && q.data !== loadedFrom) {
    setLoadedFrom(q.data);
    setForm({
        businessName: q.data.businessName,
        tractorHourlyRate: String(q.data.tractorHourlyRate),
        driverHourlyRate: String(q.data.driverHourlyRate),
        driverName: q.data.driverName,
      paymentCycleStartDate: q.data.paymentCycleStartDate,
    });
  }

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const next: Record<string, string> = {};
    const tractor = parseAmount(form.tractorHourlyRate);
    const driver = parseAmount(form.driverHourlyRate);
    if (Number.isNaN(tractor)) next.tractorHourlyRate = t('invalidAmount');
    if (Number.isNaN(driver)) next.driverHourlyRate = t('invalidAmount');
    if (!form.businessName.trim()) next.businessName = t('required');
    if (!form.driverName.trim()) next.driverName = t('required');
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateSettings({
        businessName: form.businessName.trim(),
        tractorHourlyRate: tractor,
        driverHourlyRate: driver,
        driverName: form.driverName.trim(),
        paymentCycleStartDate: form.paymentCycleStartDate,
      });
      toast.show(t('settingsSaved'));
      void q.refresh();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () =>
    Alert.alert(t('logout'), t('logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: () => void logout() },
    ]);

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
        <Card className="bg-section">
          <Text className="text-base text-ink-soft">{t('loggedInAs')}</Text>
          <Text className="text-xl font-bold text-ink">{user?.name}</Text>
          <Text className="text-base text-ink-soft">
            {user ? t(`role_${user.role}` as 'role_admin') : ''} · {user?.username}
          </Text>
        </Card>

        <Section title={t('language')}>
          <Chips
            value={lang}
            onChange={setLang}
            options={[
              { value: 'en', label: 'English' },
              { value: 'kn', label: 'ಕನ್ನಡ' },
            ]}
          />
        </Section>

        <Section title={t('settings')}>
          {q.loading ? (
            <LoadingView />
          ) : !q.data ? (
            <ErrorView message={errorMessage(q.error)} onRetry={q.refresh} />
          ) : (
            <View pointerEvents={isAdmin ? 'auto' : 'none'}>
              {!isAdmin ? <Notice message={t('onlyAdminCanChange')} tone="plain" /> : null}
              {saveError ? <Notice message={saveError} tone="red" /> : null}
              <Field label={t('businessName')} value={form.businessName} onChangeText={set('businessName')} editable={isAdmin} error={errors.businessName} />
              <Field
                label={t('tractorRate')}
                value={form.tractorHourlyRate}
                onChangeText={set('tractorHourlyRate')}
                keyboardType="decimal-pad"
                editable={isAdmin}
                error={errors.tractorHourlyRate}
              />
              <Field label={t('driverName')} value={form.driverName} onChangeText={set('driverName')} editable={isAdmin} error={errors.driverName} />
              <Field
                label={t('driverRate')}
                value={form.driverHourlyRate}
                onChangeText={set('driverHourlyRate')}
                keyboardType="decimal-pad"
                editable={isAdmin}
                error={errors.driverHourlyRate}
                hint={t('rateChangeNote')}
              />
              <DateField label={t('cycleStartDate')} value={form.paymentCycleStartDate} onChange={set('paymentCycleStartDate')} />
              <Text className="-mt-2 mb-4 text-sm text-ink-faint">{t('cycleStartHelp')}</Text>
              {isAdmin ? <Button title={t('saveSettings')} onPress={save} loading={saving} /> : null}
            </View>
          )}
        </Section>

        {isAdmin ? (
          <Pressable onPress={() => router.push('/settings/users')} className="mt-6 flex-row items-center rounded-2xl border border-line p-4 active:bg-section">
            <Users color={COLORS.ink} size={24} />
            <Text className="ml-3 flex-1 text-lg font-semibold text-ink">{t('users')}</Text>
            <ChevronRight color={COLORS.inkFaint} size={22} />
          </Pressable>
        ) : null}

        <View className="mt-6">
          <Button title={t('logout')} variant="danger" icon={<LogOut color={COLORS.expense} size={20} />} onPress={confirmLogout} />
        </View>
        <Text className="mt-6 text-center text-xs text-ink-faint">
          {t('serverAddress')}: {API_URL}
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
