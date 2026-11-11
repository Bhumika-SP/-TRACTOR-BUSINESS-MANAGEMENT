import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Calendar, Clock } from 'lucide-react-native';
import { createElement, useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { COLORS } from '@/constants/config';
import { useI18n } from '@/i18n/I18nProvider';
import { dateFromString, formatDate, formatTime, timeToDate, toDateString, toTimeString } from '@/utils/format';
import { Button } from './ui';

type Mode = 'date' | 'time';

/** Opens the phone's own date/time picker. Android shows its dialog; iOS shows a bottom sheet. */
function usePicker(mode: Mode, current: Date, onPick: (d: Date) => void) {
  const [iosOpen, setIosOpen] = useState(false);
  const [iosValue, setIosValue] = useState(current);

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode,
        is24Hour: false,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'set' && date) onPick(date);
        },
      });
    } else {
      setIosValue(current);
      setIosOpen(true);
    }
  };

  const sheet =
    Platform.OS === 'ios' ? (
      <IosSheet
        visible={iosOpen}
        mode={mode}
        value={iosValue}
        onChange={setIosValue}
        onDone={() => {
          setIosOpen(false);
          onPick(iosValue);
        }}
        onCancel={() => setIosOpen(false)}
      />
    ) : null;

  return { open, sheet };
}

function IosSheet(props: {
  visible: boolean;
  mode: Mode;
  value: Date;
  onChange: (d: Date) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onCancel}>
      <Pressable className="flex-1 bg-black/40" onPress={props.onCancel} />
      <View className="bg-white px-4 pb-10 pt-4">
        <DateTimePicker
          value={props.value}
          mode={props.mode}
          display="spinner"
          onChange={(_e, d) => d && props.onChange(d)}
          themeVariant="light"
        />
        <Button title={t('done')} onPress={props.onDone} />
      </View>
    </Modal>
  );
}

function PickerBox({ label, text, icon, onPress, error }: { label: string; text: string; icon: React.ReactNode; onPress: () => void; error?: string }) {
  return (
    <View className="mb-4 flex-1">
      <Text className="mb-2 text-base font-semibold text-ink">{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className={`flex-row items-center rounded-xl border-2 bg-white px-4 py-3 active:bg-section ${error ? 'border-expense' : 'border-line'}`}
      >
        {icon}
        <Text className="ml-3 text-lg text-ink">{text || '—'}</Text>
      </Pressable>
      {error ? <Text className="mt-1 text-base text-expense">{error}</Text> : null}
    </View>
  );
}

/**
 * Web only: the native picker library does not run in the browser, so use the browser's own
 * <input type="date|time">. Its value format ("YYYY-MM-DD" / "HH:mm") matches the form values.
 */
function WebPickerBox({ label, mode, value, onChange, icon, error }: { label: string; mode: Mode; value: string; onChange: (v: string) => void; icon: React.ReactNode; error?: string }) {
  return (
    <View className="mb-4 flex-1">
      <Text className="mb-2 text-base font-semibold text-ink">{label}</Text>
      <View className={`flex-row items-center rounded-xl border-2 bg-white px-4 py-3 ${error ? 'border-expense' : 'border-line'}`}>
        {icon}
        {createElement('input', {
          type: mode,
          value,
          'aria-label': label,
          onChange: (e: { target: { value: string } }) => {
            if (e.target.value) onChange(e.target.value);
          },
          // Open the calendar / clock on any click, not only on the small browser icon.
          onClick: (e: { currentTarget: { showPicker?: () => void } }) => {
            try {
              e.currentTarget.showPicker?.();
            } catch {
              // Older browsers: the field is still editable by typing.
            }
          },
          style: { marginLeft: 12, flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 18, color: COLORS.ink, fontFamily: 'inherit', cursor: 'pointer' },
        })}
      </View>
      {error ? <Text className="mt-1 text-base text-expense">{error}</Text> : null}
    </View>
  );
}

/** value / onChange use "YYYY-MM-DD"; shows DD-MM-YYYY. */
export function DateField(props: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  if (Platform.OS === 'web') return <WebPickerBox {...props} mode="date" icon={<Calendar color={COLORS.inkSoft} size={22} />} />;
  return <NativeDateField {...props} />;
}

function NativeDateField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  const { open, sheet } = usePicker('date', value ? dateFromString(value) : new Date(), (d) => onChange(toDateString(d)));
  return (
    <>
      <PickerBox label={label} text={formatDate(value)} icon={<Calendar color={COLORS.inkSoft} size={22} />} onPress={open} error={error} />
      {sheet}
    </>
  );
}

/** value / onChange use "HH:mm"; shows 12-hour time. */
export function TimeField(props: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  if (Platform.OS === 'web') return <WebPickerBox {...props} mode="time" icon={<Clock color={COLORS.inkSoft} size={22} />} />;
  return <NativeTimeField {...props} />;
}

function NativeTimeField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  const { open, sheet } = usePicker('time', value ? timeToDate(value) : new Date(), (d) => onChange(toTimeString(d)));
  return (
    <>
      <PickerBox label={label} text={formatTime(value)} icon={<Clock color={COLORS.inkSoft} size={22} />} onPress={open} error={error} />
      {sheet}
    </>
  );
}
