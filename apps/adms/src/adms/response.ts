import { DEFAULT_HANDSHAKE_CONFIG } from './constants';

export function buildHandshakeResponse(
  serialNumber: string,
  lastStamp: string = '9999',
  lastOpStamp: string = '9999',
  overrides: Partial<typeof DEFAULT_HANDSHAKE_CONFIG> = {},
): string {
  const cfg = { ...DEFAULT_HANDSHAKE_CONFIG, ...overrides };

  const lines = [
    `GET OPTION FROM: ${serialNumber}`,
    `Stamp=${lastStamp}`,
    `OpStamp=${lastOpStamp}`,
    `ErrorDelay=${cfg.ErrorDelay}`,
    `Delay=${cfg.Delay}`,
    `TransTimes=${cfg.TransTimes}`,
    `TransInterval=${cfg.TransInterval}`,
    `TransFlag=${cfg.TransFlag}`,
    `Realtime=${cfg.Realtime}`,
    `Encrypt=${cfg.Encrypt}`,
    `ServerVersion=${cfg.ServerVersion}`,
    `ServerName=${cfg.ServerName}`,
    `PushVersion=${cfg.PushVersion}`,
    `TimeoutSec=${cfg.TimeoutSec}`,
  ];

  return lines.join('\n');
}

export function formatCommands(commands: Array<{ command: string }>): string {
  return commands.map((cmd) => cmd.command).join('\n');
}
