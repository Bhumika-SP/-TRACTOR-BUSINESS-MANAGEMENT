import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { z } from 'zod';
import { DateField } from '@/components/pickers';
import { ReasonDialog } from '@/components/ReasonDialog';
import { useToast } from '@/components/Toast';
import { Button, Chips, ErrorView, Field, FieldLabel, LoadingView, Notice, Screen } from '@/components/ui';
import { COLORS } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { useDraft } from '@/hooks/useDraft';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useQuery } from '@/hooks/useQuery';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/types/api';
import { formatTime, parseAmount, todayString } from '@/utils/format';

const schema = z.object({
  expenseDate: z.string().min(10, 'required'),
  category: z.enum(['diesel', 'maintenance', 'repair', 'engine_oil', 'other']),
  amount: z.string().refine((v) => parseAmount(v) > 0, 'invalidAmount'),
  description: z.string().max(300),
  relatedWorkId: z.string(),
});
type FormValues = z.infer<typeof schema>;

/** Add Expense (diesel right after refuelling, repairs, …). With ?id=… it opens an existing expense. */
export default function ExpenseFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const { t, duration } = useI18n();
  const { canCreate, canEdit } = useAuth();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const readOnly = isEdit ? !canEdit : !canCreate;

  const existing = useQuery(`expense:${id}`, () => api.expense(id!), { enabled: isEdit });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { expenseDate: todayString(), category: 'diesel', amount: '', description: '', relatedWorkId: '' },
  });
  const draft = useDraft(isEdit ? null : 'new-expense', form);
  const expenseDate = useWatch({ control: form.control, name: 'expenseDate' });
  // Optional link to a job done on the same day.
  const sameDayWorks = useQuery(`works-on:${expenseDate}`, () => api.works({ from: expenseDate, to: expenseDate, limit: 20 }), { enabled: Boolean(expenseDate) && !readOnly });

  useEffect(() => {
    const e = existing.data;
    if (e) {
      form.reset({ expenseDate: e.expenseDate, category: e.category, amount: String(e.amount), description: e.description, relatedWorkId: e.relatedWorkId ?? '' });
    }
  }, [existing.data, form]);

  const save = async (values: FormValues) => {
    setSubmitError(null);
    const body = {
      expenseDate: values.expenseDate,
      category: values.category,
      amount: parseAmount(values.amount),
      description: values.description.trim(),
      relatedWorkId: values.relatedWorkId || null,
    };
    try {
      if (isEdit) {
        await api.updateExpense(id!, { ...body, reason: 'Edited from app' });
        toast.show(t('expenseUpdated'));
      } else {
        await api.createExpense({ ...body, requestId: draft.requestId });
        await draft.clearDraft();
        toast.show(t('expenseSaved'));
      }
      router.back();
    } catch (err) {
      setSubmitError(errorMessage(err));
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    if (!isEdit) return save(values);
    return new Promise<void>((resolve) => {
      Alert.alert(t('confirmEdit'), t('confirmEditBody'), [
        { text: t('cancel'), style: 'cancel', onPress: () => resolve() },
        { text: t('save'), onPress: () => void save(values).finally(resolve) },
      ]);
    });
  });

  const err = (key?: string) => (key ? t(key as Parameters<typeof t>[0]) ?? key : undefined);
  if (isEdit && existing.loading) return <Screen><LoadingView /></Screen>;
  if (isEdit && !existing.data) return <Screen><ErrorView message={errorMessage(existing.error)} onRetry={existing.refresh} /></Screen>;

  const works = sameDayWorks.data?.data ?? [];

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: isEdit ? t('editExpense') : t('addExpense').replace('+ ', '') }} />
      <Screen footer={readOnly ? undefined : <Button title={t('saveExpense')} variant="primary" onPress={onSubmit} loading={form.formState.isSubmitting} />}>
        {readOnly ? <Notice message={t('readOnly')} tone="plain" /> : null}
        {draft.restored ? <Notice message={t('draftRestored')} tone="blue" /> : null}
        {submitError ? <Notice message={submitError} tone="red" /> : null}

        <View pointerEvents={readOnly ? 'none' : 'auto'}>
          <Controller control={form.control} name="expenseDate" render={({ field }) => <DateField label={t('expenseDate')} value={field.value} onChange={field.onChange} />} />
          <FieldLabel>{t('category')}</FieldLabel>
          <Controller
            control={form.control}
            name="category"
            render={({ field }) => (
              <Chips<ExpenseCategory> value={field.value} onChange={field.onChange} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(c) }))} />
            )}
          />
          <View className="mt-4">
            <Controller
              control={form.control}
              name="amount"
              render={({ field, fieldState }) => (
                <Field label={t('amount')} value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" placeholder="0" editable={!readOnly} error={err(fieldState.error?.message)} />
              )}
            />
            <Controller
              control={form.control}
              name="description"
              render={({ field }) => <Field label={t('descriptionOptional')} value={field.value} onChangeText={field.onChange} editable={!readOnly} maxLength={300} />}
            />
          </View>
          {!readOnly && works.length > 0 ? (
            <>
              <FieldLabel>{t('relatedWorkOptional')}</FieldLabel>
              <Controller
                control={form.control}
                name="relatedWorkId"
                render={({ field }) => (
                  <Chips
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: '', label: t('none') },
                      ...works.map((w) => ({ value: w.id, label: `${w.customerName} · ${formatTime(w.fromTime)} (${duration(w.workingMinutes)})` })),
                    ]}
                  />
                )}
              />
            </>
          ) : null}
        </View>

        {isEdit && canEdit ? (
          <View className="mt-8">
            <Button title={t('delete')} variant="danger" icon={<Trash2 color={COLORS.expense} size={20} />} onPress={() => setDeleting(true)} />
          </View>
        ) : null}
      </Screen>

      <ReasonDialog
        visible={deleting}
        title={t('confirmDelete')}
        confirmLabel={t('delete')}
        onClose={() => setDeleting(false)}
        onConfirm={async (reason) => {
          try {
            await api.deleteExpense(id!, reason);
            setDeleting(false);
            toast.show(t('expenseDeleted'));
            router.back();
          } catch (e) {
            setDeleting(false);
            toast.show(errorMessage(e), 'error');
          }
        }}
      />
    </KeyboardAvoidingView>
  );
}
