export const ACCOUNT_TYPE_VALUES = [
  'crypto_wallet',
  'bank_account',
  'platform',
  'custody',
  'other',
] as const;

export type ModernAccountType = typeof ACCOUNT_TYPE_VALUES[number];

export const LEGACY_ACCOUNT_TYPE_VALUES = ['hot', 'cold', 'exchange', 'staked'] as const;
export type LegacyAccountType = typeof LEGACY_ACCOUNT_TYPE_VALUES[number];

export type AccountTypeValue = ModernAccountType | LegacyAccountType;

const LEGACY_ACCOUNT_TYPE_MAP: Record<LegacyAccountType, ModernAccountType> = {
  hot: 'crypto_wallet',
  cold: 'crypto_wallet',
  exchange: 'platform',
  staked: 'custody',
};

const ACCOUNT_TYPE_LABELS: Record<ModernAccountType, string> = {
  crypto_wallet: 'Crypto Wallet',
  bank_account: 'Bank Account',
  platform: 'Exchange / Platform',
  custody: 'Custody / Staking',
  other: 'Other',
};

export const ACCOUNT_TYPE_OPTIONS = ACCOUNT_TYPE_VALUES.map((value) => ({
  value,
  label: ACCOUNT_TYPE_LABELS[value],
}));

export const normalizeAccountType = (value?: AccountTypeValue): ModernAccountType => {
  if (!value) {
    return 'crypto_wallet';
  }
  if ((LEGACY_ACCOUNT_TYPE_VALUES as readonly string[]).includes(value)) {
    return LEGACY_ACCOUNT_TYPE_MAP[value as LegacyAccountType];
  }
  if ((ACCOUNT_TYPE_VALUES as readonly string[]).includes(value as ModernAccountType)) {
    return value as ModernAccountType;
  }
  return 'other';
};

export const getAccountTypeLabel = (value?: AccountTypeValue): string => {
  const normalized = normalizeAccountType(value);
  return ACCOUNT_TYPE_LABELS[normalized];
};

export const isLegacyAccountType = (value: AccountTypeValue): value is LegacyAccountType => {
  return (LEGACY_ACCOUNT_TYPE_VALUES as readonly string[]).includes(value as string);
};
