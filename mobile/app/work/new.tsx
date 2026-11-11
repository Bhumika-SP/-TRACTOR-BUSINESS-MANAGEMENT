import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Alert, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { z } from 'zod';
import { FarmerInput } from '@/components/FarmerInput';
import { DateField, TimeField } from '@/components/pickers';
import { useToast } from '@/components/Toast';
import { Button, ErrorView, Field, LoadingView, Notice, Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useDraft } from '@/hooks/useDraft';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useQuery } from '@/hooks/useQuery';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';
import { formatINR, minutesBetween, parseAmount, previewAmount, todayString } from '@/utils/format';

const schema = z
  .object({
    customerName: z.string().trim().min(1, 'enterFarmerName'),
    customerId: z.string().nullable(),
    phone: z.string().trim().max(20).regex(/^[0-9+\-\s]*$/, 'invalidPhone'),
    workDate: z.string().min(10, 'required'),
    description: z.string().max(300),
    fromTime: z.string().min(5, 'required'),
    toTime: z.string().min(5, 'required'),
    rate: z.string().refine((v) => !Number.isNaN(parseAmount(v)), 'invalidAmount'),
  })
  .refine((v) => !v.fromTime || !v.toTime || v.fromTime !== v.toTime, { message: 'sameTimeError', path: ['toTime'] });

type FormValues = z.infer<typeof schema>;

/** Add New Work, and Edit Work when opened with ?id=… */
export default function WorkFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const { t } = useI18n();
  const { canCreate, canEdit } = useAuth();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const settings = useQuery('settings', () => api.settings());
  const existing = useQuery(`work:${id}`, () => api.work(id!), { enabled: isEdit });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: '',
      customerId: null,
      phone: '',
      workDate: todayString(),
      description: '',
      fromTime: '',
      toTime: '',
      rate: '',
    },
  });
  // New entries are kept on the phone until saved. Edits are not drafted.
  const draft = useDraft(isEdit ? null : 'new-work', form);

  // Fill the default rate from Settings for new work.
  useEffect(() => {
    if (!isEdit && draft.loaded && settings.data && !form.getValues('rate')) {
      form.setValue('rate', String(settings.data.tractorHourlyRate));
    }
  }, [isEdit, draft.loaded, settings.data, form]);

  // Fill the form with the saved work when editing.
  useEffect(() => {
    const w = existing.data;
    if (isEdit && w) {
      form.reset({
        customerName: w.customerName,
        customerId: w.customerId,
        phone: w.customerPhone,
        workDate: w.workDate,
        description: w.description,
        fromTime: w.fromTime,
        toTime: w.toTime,
        rate: String(w.tractorHourlyRate),
      });
    }
  }, [isEdit, existing.data, form]);

  const customerId = useWatch({ control: form.control, name: 'customerId' });
  const [fromTime, toTime, rateText] = useWatch({ control: form.control, name: ['fromTime', 'toTime', 'rate'] });
  const minutes = fromTime && toTime ? minutesBetween(fromTime, toTime) : 0;
  const rate = parseAmount(rateText ?? '');
  const amount = minutes > 0 && !Number.isNaN(rate) ? previewAmount(minutes, rate) : 0;
  const crossesMidnight = Boolean(fromTime && toTime && toTime < fromTime);

  const save = async (values: FormValues) => {
    setSubmitError(null);
    const body = {
      ...(values.customerId ? { customerId: values.customerId } : { customerName: values.customerName.trim() }),
      phone: values.phone.trim(),
      workDate: values.workDate,
      description: values.description.trim(),
      fromTime: values.fromTime,
      toTime: values.toTime,
      tractorHourlyRate: parseAmount(values.rate),
    };
    try {
      if (isEdit) {
        await api.updateWork(id!, { ...body, customerName: values.customerName.trim(), reason: 'Edited from app' });
        toast.show(t('workUpdated'));
      } else {
        await api.createWork({ ...body, requestId: draft.requestId });
        await draft.clearDraft();
        toast.show(t('workSaved'));
      }
      router.back();
    } catch (err) {
      setSubmitError(errorMessage(err));
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    if (!isEdit) return save(values);
    // Corrections to financial records always ask first.
    return new Promise<void>((resolve) => {
      Alert.alert(t('confirmEdit'), t('confirmEditBody'), [
        { text: t('cancel'), style: 'cancel', onPress: () => resolve() },
        { text: t('save'), onPress: () => void save(values).finally(resolve) },
      ]);
    });
  });

  const allowed = isEdit ? canEdit : canCreate;
  const err = (key?: string) => (key ? t(key as Parameters<typeof t>[0]) ?? key : undefined);

  if (!allowed) return <Screen><Notice message={t('readOnly')} /></Screen>;
  if (isEdit && existing.loading) return <Screen><LoadingView /></Screen>;
  if (isEdit && !existing.data) return <Screen><ErrorView message={errorMessage(existing.error)} onRetry={existing.refresh} /></Screen>;

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: isEdit ? t('editWork') : t('addNewWork').replace('+ ', '') }} />
      <Screen
        footer={<Button title={form.formState.isSubmitting ? t('saving') : t('saveWork')} onPress={onSubmit} loading={form.formState.isSubmitting} />}
      >
        {draft.restored ? <Notice message={t('draftRestored')} tone="blue" /> : null}
        {submitError ? <Notice message={submitError} tone="red" /> : null}

        <Controller
          control={form.control}
          name="customerName"
          render={({ field, fieldState }) => (
            <FarmerInput
              name={field.value}
              customerId={customerId}
              error={err(fieldState.error?.message)}
              onChange={(v) => {
                field.onChange(v.name);
                form.setValue('customerId', v.customerId);
                if (v.phone !== undefined) form.setValue('phone', v.phone);
              }}
            />
          )}
        />
        <Controller
          control={form.control}
          name="phone"
          render={({ field, fieldState }) => (
            <Field label={t('phoneOptional')} value={field.value} onChangeText={field.onChange} keyboardType="phone-pad" maxLength={15} error={fieldState.error ? t('invalidPhone') : undefined} />
          )}
        />
        <Controller
          control={form.control}
          name="workDate"
          render={({ field, fieldState }) => <DateField label={t('workDate')} value={field.value} onChange={field.onChange} error={err(fieldState.error?.message)} />}
        />
        <Controller
          control={form.control}
          name="description"
          render={({ field }) => <Field label={t('descriptionOptional')} value={field.value} onChangeText={field.onChange} maxLength={300} />}
        />
        <View className="flex-row" style={{ gap: 12 }}>
          <Controller
            control={form.control}
            name="fromTime"
            render={({ field, fieldState }) => <TimeField label={t('fromTime')} value={field.value} onChange={field.onChange} error={err(fieldState.error?.message)} />}
          />
          <Controller
            control={form.control}
            name="toTime"
            render={({ field, fieldState }) => <TimeField label={t('toTime')} value={field.value} onChange={field.onChange} error={err(fieldState.error?.message)} />}
          />
        </View>
        <Controller
          control={form.control}
          name="rate"
          render={({ field, fieldState }) => (
            <Field label={t('ratePerHour')} value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" error={err(fieldState.error?.message)} />
          )}
        />

        {/* Automatic calculation shown before saving */}
        <View className="mt-2 rounded-2xl bg-profit-light p-4">
          <View className="flex-row justify-between">
            <Text className="text-lg text-ink-soft">{t('runningTime')}</Text>
            <Text className="text-lg font-bold text-ink">{minutes > 0 ? `${Math.floor(minutes / 60)} ${t('hours')} ${minutes % 60} ${t('minutes')}` : '—'}</Text>
          </View>
          {crossesMidnight ? <Text className="mt-1 text-base text-pending">{t('crossesMidnight')}</Text> : null}
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-ink">{t('totalWorkAmount')}</Text>
            <Text className="text-3xl font-extrabold text-profit">{formatINR(amount)}</Text>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
