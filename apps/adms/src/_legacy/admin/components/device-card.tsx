import type { FC } from 'hono/jsx';

type Props = {
  serialNumber: string;
  name: string | null;
  isOnline: boolean | null;
  lastOnline: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  id: number;
};

export const DeviceCard: FC<Props> = ({ serialNumber, name, isOnline, lastOnline, deviceType, ipAddress, id }) => {
  return (
    <a href={`/admin/devices/${id}`} class="block bg-white rounded-lg border p-4 hover:shadow-md transition-shadow">
      <div class="flex items-center justify-between mb-2">
        <span class="font-semibold text-gray-900">{name || serialNumber}</span>
        <span class={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
          isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          <span class={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>
      <div class="text-sm text-gray-500 space-y-1">
        <p>SN: {serialNumber}</p>
        {deviceType && <p>Type: {deviceType}</p>}
        {ipAddress && <p>IP: {ipAddress}</p>}
        {lastOnline && <p>Last seen: {lastOnline}</p>}
      </div>
    </a>
  );
};
