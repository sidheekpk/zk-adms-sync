import type { FC } from 'hono/jsx';
import { MainLayout } from '../layouts/main.js';
import { DeviceCard } from '../components/device-card.js';
import { STATUS_LABELS, VERIFY_LABELS } from '../../adms/constants.js';

type Device = {
  id: number;
  serialNumber: string;
  name: string | null;
  model: string | null;
  firmwareVersion: string | null;
  ipAddress: string | null;
  pushVersion: string | null;
  deviceType: string | null;
  isOnline: boolean | null;
  lastOnline: string | null;
  userCount: number | null;
  attLogCount: number | null;
  heartbeatInterval: number | null;
  createdAt: string | null;
};

export const DevicesPage: FC<{ devices: Device[] }> = ({ devices }) => {
  const online = devices.filter(d => d.isOnline);
  const offline = devices.filter(d => !d.isOnline);

  return (
    <MainLayout title="Devices" activePage="/admin/devices">
      <div class="mb-4 flex items-center justify-between">
        <p class="text-sm text-gray-500">
          {online.length} online, {offline.length} offline — {devices.length} total
        </p>
      </div>

      {devices.length === 0 ? (
        <div class="bg-white rounded-lg border p-12 text-center">
          <p class="text-gray-400 text-lg mb-2">No devices registered</p>
          <p class="text-gray-400 text-sm">Devices auto-register when they first connect via ADMS</p>
        </div>
      ) : (
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {devices.map(device => (
            <DeviceCard
              id={device.id}
              serialNumber={device.serialNumber}
              name={device.name}
              isOnline={device.isOnline}
              lastOnline={device.lastOnline}
              deviceType={device.deviceType}
              ipAddress={device.ipAddress}
            />
          ))}
        </div>
      )}
    </MainLayout>
  );
};

type DeviceDetailProps = {
  device: Device;
  attendance: Array<{
    id: number;
    pin: string;
    timestamp: string;
    status: number;
    verifyMode: number;
    syncStatus: string | null;
  }>;
  commands: Array<{
    id: number;
    commandId: number;
    commandType: string;
    status: string | null;
    returnCode: number | null;
    createdAt: string | null;
  }>;
};

export const DeviceDetailPage: FC<DeviceDetailProps> = ({ device, attendance, commands }) => {
  return (
    <MainLayout title={device.name || device.serialNumber} activePage="/admin/devices">
      <a href="/admin/devices" class="text-sm text-blue-600 hover:underline mb-4 inline-block">&larr; Back to devices</a>

      {/* Device Info */}
      <div class="bg-white rounded-lg border p-6 mb-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-lg font-semibold">{device.name || device.serialNumber}</h3>
            <p class="text-sm text-gray-500">SN: {device.serialNumber}</p>
          </div>
          <span class={`inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full ${
            device.isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            <span class={`w-2.5 h-2.5 rounded-full ${device.isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {device.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span class="text-gray-500">Type:</span> {device.deviceType || 'N/A'}</div>
          <div><span class="text-gray-500">IP:</span> {device.ipAddress || 'N/A'}</div>
          <div><span class="text-gray-500">Firmware:</span> {device.firmwareVersion || 'N/A'}</div>
          <div><span class="text-gray-500">Push Ver:</span> {device.pushVersion || 'N/A'}</div>
          <div><span class="text-gray-500">Users:</span> {device.userCount ?? 'N/A'}</div>
          <div><span class="text-gray-500">Heartbeat:</span> {device.heartbeatInterval || 30}s</div>
          <div><span class="text-gray-500">Last Seen:</span> {device.lastOnline || 'Never'}</div>
          <div><span class="text-gray-500">Registered:</span> {device.createdAt || 'N/A'}</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div class="bg-white rounded-lg border p-4 mb-6">
        <h4 class="text-sm font-medium text-gray-700 mb-3">Quick Actions</h4>
        <div class="flex flex-wrap gap-2">
          <form method="post" action={`/admin/devices/${device.id}/command`} class="inline">
            <input type="hidden" name="type" value="reboot" />
            <button type="submit" class="px-3 py-1.5 text-xs font-medium rounded bg-red-100 text-red-700 hover:bg-red-200">Reboot</button>
          </form>
          <form method="post" action={`/admin/devices/${device.id}/command`} class="inline">
            <input type="hidden" name="type" value="sync_time" />
            <button type="submit" class="px-3 py-1.5 text-xs font-medium rounded bg-blue-100 text-blue-700 hover:bg-blue-200">Sync Time</button>
          </form>
          <form method="post" action={`/admin/devices/${device.id}/command`} class="inline">
            <input type="hidden" name="type" value="info" />
            <button type="submit" class="px-3 py-1.5 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200">Get Info</button>
          </form>
          <form method="post" action={`/admin/devices/${device.id}/command`} class="inline">
            <input type="hidden" name="type" value="get_options" />
            <button type="submit" class="px-3 py-1.5 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200">Get Options</button>
          </form>
        </div>
      </div>

      {/* Recent Attendance */}
      <div class="bg-white rounded-lg border mb-6">
        <div class="px-4 py-3 border-b">
          <h4 class="text-sm font-medium text-gray-700">Recent Attendance</h4>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">PIN</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Verify</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sync</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              {attendance.map(log => (
                <tr class="text-sm">
                  <td class="px-4 py-2 whitespace-nowrap">{log.timestamp}</td>
                  <td class="px-4 py-2">{log.pin}</td>
                  <td class="px-4 py-2">
                    <span class={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                      log.status === 0 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>{STATUS_LABELS[log.status] || `Status ${log.status}`}</span>
                  </td>
                  <td class="px-4 py-2 text-xs text-gray-500">{VERIFY_LABELS[log.verifyMode] || 'Unknown'}</td>
                  <td class="px-4 py-2">
                    <span class={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                      log.syncStatus === 'synced' ? 'bg-green-100 text-green-700' :
                      log.syncStatus === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{log.syncStatus || 'pending'}</span>
                  </td>
                </tr>
              ))}
              {attendance.length === 0 && (
                <tr><td colspan={5} class="px-4 py-6 text-center text-gray-400 text-sm">No attendance records</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Command History */}
      <div class="bg-white rounded-lg border">
        <div class="px-4 py-3 border-b">
          <h4 class="text-sm font-medium text-gray-700">Command History</h4>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Return</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              {commands.map(cmd => (
                <tr class="text-sm">
                  <td class="px-4 py-2">{cmd.commandId}</td>
                  <td class="px-4 py-2">{cmd.commandType}</td>
                  <td class="px-4 py-2">
                    <span class={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                      cmd.status === 'success' ? 'bg-green-100 text-green-700' :
                      cmd.status === 'failed' ? 'bg-red-100 text-red-700' :
                      cmd.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{cmd.status || 'pending'}</span>
                  </td>
                  <td class="px-4 py-2 text-gray-500">{cmd.returnCode ?? '-'}</td>
                  <td class="px-4 py-2 text-gray-500">{cmd.createdAt}</td>
                </tr>
              ))}
              {commands.length === 0 && (
                <tr><td colspan={5} class="px-4 py-6 text-center text-gray-400 text-sm">No commands sent</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
};
