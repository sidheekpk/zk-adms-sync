export const STATUS_LABELS: Record<number, string> = {
  0: 'Check-In',
  1: 'Check-Out',
  2: 'Break-Out',
  3: 'Break-In',
  4: 'Overtime-In',
  5: 'Overtime-Out',
};

export const VERIFY_LABELS: Record<number, string> = {
  0: 'Password',
  1: 'Fingerprint',
  2: 'Card',
  4: 'Palm',
  9: 'Face',
  15: 'Face',
};

export const DEFAULT_HANDSHAKE_CONFIG = {
  ErrorDelay: 60,
  Delay: 30,
  TransTimes: '00:00;14:05',
  TransInterval: 1,
  TransFlag: '1111000000',
  Realtime: 1,
  Encrypt: 0,
  ServerVersion: '3.0.1',
  ServerName: 'ZKConnect',
  PushVersion: '3.0.1',
  TimeoutSec: 10,
};
