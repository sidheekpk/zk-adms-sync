import type { FC } from 'hono/jsx';
import { MainLayout } from '../layouts/main.js';

type Device = { id: number; serialNumber: string; name: string | null };
type Command = {
  id: number;
  deviceId: number;
  commandId: number;
  command: string;
  commandType: string;
  status: string | null;
  returnCode: number | null;
  sentAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
};

type Props = {
  commands: Command[];
  devices: Device[];
};

export const CommandsPage: FC<Props> = ({ commands, devices }) => {
  return (
    <MainLayout title="Commands" activePage="/admin/commands">
      {/* Send Command */}
      <div class="bg-white rounded-lg border p-4 mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-3">Send Command</h3>
        <form method="post" action="/admin/commands" class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Device</label>
            <select name="deviceId" required class="w-full border rounded px-2 py-1.5 text-sm">
              <option value="">Select Device</option>
              {devices.map(d => (
                <option value={String(d.id)}>{d.name || d.serialNumber}</option>
              ))}
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Command</label>
            <select name="type" required class="w-full border rounded px-2 py-1.5 text-sm">
              <option value="reboot">Reboot</option>
              <option value="sync_time">Sync Time</option>
              <option value="info">Get Info</option>
              <option value="get_options">Get Options</option>
              <option value="clear_log">Clear Att Log</option>
              <option value="query_users">Query Users</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Parameters (JSON)</label>
            <input type="text" name="params" placeholder='{}' class="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div class="flex items-end">
            <button type="submit" class="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700">Send</button>
          </div>
        </form>
      </div>

      {/* Command History */}
      <div class="bg-white rounded-lg border overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">CMD ID</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Command</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Return</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            {commands.map(cmd => (
              <tr class="text-sm">
                <td class="px-4 py-2 font-mono">{cmd.commandId}</td>
                <td class="px-4 py-2">{cmd.deviceId}</td>
                <td class="px-4 py-2">{cmd.commandType}</td>
                <td class="px-4 py-2 text-xs text-gray-500 font-mono max-w-xs truncate">{cmd.command}</td>
                <td class="px-4 py-2">
                  <span class={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                    cmd.status === 'success' ? 'bg-green-100 text-green-700' :
                    cmd.status === 'failed' ? 'bg-red-100 text-red-700' :
                    cmd.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                    cmd.status === 'expired' ? 'bg-gray-100 text-gray-500' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{cmd.status || 'pending'}</span>
                </td>
                <td class="px-4 py-2 text-gray-500">{cmd.returnCode ?? '-'}</td>
                <td class="px-4 py-2 text-gray-500 whitespace-nowrap">{cmd.createdAt}</td>
                <td class="px-4 py-2 text-gray-500 whitespace-nowrap">{cmd.completedAt || '-'}</td>
              </tr>
            ))}
            {commands.length === 0 && (
              <tr><td colspan={8} class="px-4 py-8 text-center text-gray-400 text-sm">No commands yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </MainLayout>
  );
};
