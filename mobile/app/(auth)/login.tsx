import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect } from 'expo-router';
import { Tractor } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { Button, Chips, Field, Notice } from '@/components/ui';
import { COLORS } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useI18n } from '@/i18n/I18nProvider';
import { ApiError } from '@/services/api';

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const { user, ready, login } = useAuth();
  const { t, lang, setLang } = useI18n();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { username: '', password: '' } });

  if (ready && user) return <Redirect href="/" />;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values.username, values.password);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t('wrongLogin') : errorMessage(err));
    }
  });

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <View className="mb-8 items-center">
            <View className="mb-4 h-24 w-24 items-center justify-center rounded-3xl bg-profit-light">
              <Tractor color={COLORS.brand} size={56} />
            </View>
            <Text className="text-3xl font-bold text-ink">{t('appName')}</Text>
            <Text className="mt-2 text-center text-base text-ink-soft">{t('loginHelp')}</Text>
          </View>

          {error ? <Notice message={error} tone="red" /> : null}

          <Controller
            control={form.control}
            name="username"
            render={({ field, fieldState }) => (
              <Field
                label={t('username')}
                value={field.value}
                onChangeText={field.onChange}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                error={fieldState.error ? t('required') : undefined}
              />
            )}
          />
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field
                label={t('password')}
                value={field.value}
                onChangeText={field.onChange}
                secureTextEntry
                autoComplete="password"
                onSubmitEditing={() => void onSubmit()}
                error={fieldState.error ? t('required') : undefined}
              />
            )}
          />
          <View className="mt-2">
            <Button title={t('login')} onPress={onSubmit} loading={form.formState.isSubmitting} />
          </View>

          <View className="mt-10 items-center">
            <Chips
              options={[
                { value: 'en', label: 'English' },
                { value: 'kn', label: 'ಕನ್ನಡ' },
              ]}
              value={lang}
              onChange={setLang}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
