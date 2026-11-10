import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Switch, Text, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Chips, Field, FieldLabel, LoadingView, Notice, Screen } from '@/components/ui';
import { COLORS } from '@/constants/config';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useQuery } from '@/hooks/useQuery';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';
import type { Role } from '@/types/api';

/** Owner adds a new user, or edits role / edit permission / active / password. */
export default function UserFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const { t } = useI18n();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const users = useQuery('users', () => api.users(), { enabled: isEdit });
  const existing = users.data?.find((u) => u.id === id);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('entry');
  const [canEdit, setCanEdit] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fill the form once the user being edited has loaded.
  const [loadedFrom, setLoadedFrom] = useState<typeof existing>(undefined);
  if (existing && existing !== loadedFrom) {
    setLoadedFrom(existing);
    setName(existing.name);
    setUsername(existing.username);
    setRole(existing.role);
    setCanEdit(existing.canEdit);
    setIsActive(existing.isActive);
  }

  const save = async () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t('required');
    if (!isEdit && username.trim().length < 3) next.username = t('required');
    if (!isEdit && password.length < 6) next.password = t('required');
    if (isEdit && password && password.length < 6) next.password = t('required');
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (isEdit) {
        await api.updateUser(id!, { name: name.trim(), role, canEdit, isActive, ...(password ? { password } : {}) });
      } else {
        await api.createUser({ name: name.trim(), username: username.trim().toLowerCase(), password, role, canEdit });
      }
      toast.show(t('userSaved'));
      router.back();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && users.loading) return <Screen><LoadingView /></Screen>;

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: isEdit ? t('editUser') : t('addUser').replace('+ ', '') }} />
      <Screen footer={<Button title={t('saveUser')} onPress={save} loading={saving} />}>
        {saveError ? <Notice message={saveError} tone="red" /> : null}
        <Field label={t('name')} value={name} onChangeText={setName} error={errors.name} />
        <Field
          label={t('username')}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isEdit}
          error={errors.username}
        />
        <Field
          label={isEdit ? t('newPasswordOptional') : t('password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={errors.password}
        />
        <FieldLabel>{t('role')}</FieldLabel>
        <Chips<Role>
          value={role}
          onChange={setRole}
          options={[
            { value: 'admin', label: t('role_admin') },
            { value: 'entry', label: t('role_entry') },
            { value: 'viewer', label: t('role_viewer') },
          ]}
        />
        {role === 'entry' ? (
          <View className="mt-5 flex-row items-center justify-between rounded-xl bg-section px-4 py-3">
            <Text className="mr-3 flex-1 text-base text-ink">{t('canEditRecords')}</Text>
            <Switch value={canEdit} onValueChange={setCanEdit} trackColor={{ true: COLORS.brand }} />
          </View>
        ) : null}
        {isEdit ? (
          <View className="mt-3 flex-row items-center justify-between rounded-xl bg-section px-4 py-3">
            <Text className="mr-3 flex-1 text-base text-ink">{t('active')}</Text>
            <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: COLORS.brand }} />
          </View>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
