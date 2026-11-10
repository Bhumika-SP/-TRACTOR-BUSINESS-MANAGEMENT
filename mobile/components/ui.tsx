import { useNetInfo } from '@react-native-community/netinfo';
import { AlertCircle, Inbox, WifiOff } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { COLORS } from '@/constants/config';
import { useI18n } from '@/i18n/I18nProvider';
import type { CycleStatus, PaymentStatus } from '@/types/api';
import { formatINR } from '@/utils/format';

// ---------------------------------------------------------------- layout

export function Screen({
  children,
  refreshing,
  onRefresh,
  footer,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
}) {
  return (
    <View className="flex-1 bg-white">
      <OfflineBanner />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
      >
        {children}
      </ScrollView>
      {footer ? <View className="border-t border-line bg-white px-4 pb-6 pt-3">{footer}</View> : null}
    </View>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-2xl border border-line bg-white p-4 ${className}`}>{children}</View>;
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View className="mt-6">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-xl font-bold text-ink">{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Row({ label, value, valueClass = 'text-ink' }: { label: string; value: ReactNode; valueClass?: string }) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="mr-3 flex-1 text-base text-ink-soft">{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text className={`text-lg font-semibold ${valueClass}`}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

export function Divider() {
  return <View className="my-1 h-px bg-line" />;
}

// ---------------------------------------------------------------- money

const TONE = {
  blue: { bg: 'bg-received-light', text: 'text-received' },
  orange: { bg: 'bg-pending-light', text: 'text-pending' },
  red: { bg: 'bg-expense-light', text: 'text-expense' },
  green: { bg: 'bg-profit-light', text: 'text-profit' },
  plain: { bg: 'bg-section', text: 'text-ink' },
} as const;
export type Tone = keyof typeof TONE;

export function MoneyCard({ label, amount, tone }: { label: string; amount: number; tone: Tone }) {
  return (
    <View className={`flex-1 rounded-2xl p-4 ${TONE[tone].bg}`}>
      <Text className="text-base font-medium text-ink-soft">{label}</Text>
      <Text className={`mt-2 text-2xl font-bold ${TONE[tone].text}`} numberOfLines={1} adjustsFontSizeToFit>
        {formatINR(amount)}
      </Text>
    </View>
  );
}

export function Money({ amount, className = 'text-ink' }: { amount: number; className?: string }) {
  return <Text className={`text-lg font-semibold ${className}`}>{formatINR(amount)}</Text>;
}

// ---------------------------------------------------------------- buttons

type Variant = 'primary' | 'secondary' | 'danger' | 'outline';
const VARIANT: Record<Variant, { box: string; text: string; spinner: string }> = {
  primary: { box: 'bg-brand', text: 'text-white', spinner: COLORS.white },
  secondary: { box: 'bg-received', text: 'text-white', spinner: COLORS.white },
  danger: { box: 'bg-white border-2 border-expense', text: 'text-expense', spinner: COLORS.expense },
  outline: { box: 'bg-white border-2 border-line', text: 'text-ink', spinner: COLORS.ink },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  small = false,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  small?: boolean;
}) {
  const v = VARIANT[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      className={`flex-row items-center justify-center rounded-2xl ${small ? 'px-4 py-3' : 'px-5 py-4'} ${v.box} ${off ? 'opacity-60' : 'active:opacity-80'}`}
    >
      {loading ? <ActivityIndicator color={v.spinner} /> : icon}
      <Text className={`${icon || loading ? 'ml-2' : ''} ${small ? 'text-base' : 'text-lg'} font-bold ${v.text}`}>{title}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- inputs

export function Field({ label, error, hint, ...props }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-base font-semibold text-ink">{label}</Text>
      <TextInput
        placeholderTextColor={COLORS.inkFaint}
        className={`rounded-xl border-2 bg-white px-4 py-3 text-lg text-ink ${error ? 'border-expense' : 'border-line'}`}
        {...props}
      />
      {error ? <Text className="mt-1 text-base text-expense">{error}</Text> : null}
      {!error && hint ? <Text className="mt-1 text-sm text-ink-faint">{hint}</Text> : null}
    </View>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text className="mb-2 text-base font-semibold text-ink">{children}</Text>;
}

/** Big tappable choices, e.g. Cash / UPI / Bank. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  wrap = true,
}: {
  options: { value: T; label: string }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  wrap?: boolean;
}) {
  return (
    <View className={`flex-row ${wrap ? 'flex-wrap' : ''}`} style={{ gap: 8 }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            className={`rounded-full border-2 px-4 py-2 ${selected ? 'border-brand bg-brand' : 'border-line bg-white'}`}
          >
            <Text className={`text-base font-semibold ${selected ? 'text-white' : 'text-ink'}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Tabs inside a screen (e.g. Customer / Driver / Expenses). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row rounded-2xl bg-section p-1">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            className={`flex-1 items-center rounded-xl py-3 ${selected ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`text-base font-bold ${selected ? 'text-brand' : 'text-ink-soft'}`} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- status

export function StatusBadge({ status }: { status: PaymentStatus | CycleStatus | 'cancelled' }) {
  const { t } = useI18n();
  const map = {
    paid: { label: t('paid'), cls: 'bg-profit-light', text: 'text-profit' },
    partial: { label: t('partPaid'), cls: 'bg-pending-light', text: 'text-pending' },
    pending: { label: t('pending'), cls: 'bg-pending-light', text: 'text-pending' },
    no_work: { label: t('noWork'), cls: 'bg-section', text: 'text-ink-soft' },
    cancelled: { label: t('cancelled'), cls: 'bg-section', text: 'text-ink-faint' },
  } as const;
  const s = map[status];
  return (
    <View className={`self-start rounded-full px-3 py-1 ${s.cls}`}>
      <Text className={`text-sm font-bold ${s.text}`}>{s.label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- states

export function LoadingView() {
  const { t } = useI18n();
  return (
    <View className="items-center justify-center py-16">
      <ActivityIndicator size="large" color={COLORS.brand} />
      <Text className="mt-3 text-base text-ink-soft">{t('loading')}</Text>
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View className="items-center rounded-2xl bg-section px-4 py-10">
      <Inbox color={COLORS.inkFaint} size={36} />
      <Text className="mt-3 text-center text-base text-ink-soft">{message}</Text>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <View className="items-center rounded-2xl bg-expense-light px-4 py-8">
      <AlertCircle color={COLORS.expense} size={32} />
      <Text className="my-3 text-center text-base text-expense">{message}</Text>
      {onRetry ? <Button title={t('retry')} onPress={onRetry} variant="outline" small /> : null}
    </View>
  );
}

export function Notice({ message, tone = 'orange' }: { message: string; tone?: Tone }) {
  return (
    <View className={`mb-4 rounded-xl px-4 py-3 ${TONE[tone].bg}`}>
      <Text className={`text-base ${TONE[tone].text}`}>{message}</Text>
    </View>
  );
}

export function OfflineBanner() {
  const net = useNetInfo();
  const { t } = useI18n();
  if (net.isConnected !== false) return null;
  return (
    <View className="flex-row items-center bg-pending px-4 py-2">
      <WifiOff color={COLORS.white} size={18} />
      <Text className="ml-2 flex-1 text-sm font-semibold text-white">{t('offline')}</Text>
    </View>
  );
}
