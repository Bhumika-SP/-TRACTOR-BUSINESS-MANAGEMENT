import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Text, View } from 'react-native';
import { useI18n } from '@/i18n/I18nProvider';
import { Button, Field } from './ui';

/**
 * Confirmation for financial corrections (delete, cancel payment, edit). Asks for a short
 * reason, which is saved in the change record on the server.
 */
export function ReasonDialog({
  visible,
  title,
  message,
  confirmLabel,
  danger = true,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  // Start with an empty box every time the dialog opens.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setReason('');
      setError(undefined);
      setBusy(false);
    }
  }

  const submit = async () => {
    if (reason.trim().length < 3) {
      setError(t('reasonRequired'));
      return;
    }
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-center bg-black/40 px-5">
        <View className="rounded-3xl bg-white p-5">
          <Text className="mb-2 text-xl font-bold text-ink">{title}</Text>
          {message ? <Text className="mb-4 text-base text-ink-soft">{message}</Text> : null}
          <Field label={t('reasonPrompt')} value={reason} onChangeText={setReason} error={error} autoFocus maxLength={300} />
          <View className="flex-row" style={{ gap: 12 }}>
            <View className="flex-1">
              <Button title={t('cancel')} variant="outline" onPress={onClose} disabled={busy} />
            </View>
            <View className="flex-1">
              <Button title={confirmLabel} variant={danger ? 'danger' : 'primary'} onPress={submit} loading={busy} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
