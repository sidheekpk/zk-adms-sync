import type { FC } from 'hono/jsx';
import { MainLayout } from '../layouts/main.js';
import { STATUS_LABELS, VERIFY_LABELS } from '../../adms/constants.js';

type AttLog = {
  id: number;
  deviceSN: string;
  pin: string;
  timestamp: string;
  status: number;
  verifyMode: number;
  syncStatus: string | null;
  createdAt: string | null;
};

type Props = {
  logs: AttLog[];
  filters: {
    from?: string;
    to?: string;
    pin?: string;
    device_sn?: string;
    sync_status?: string;
  };
  devices: Array<{ serialNumber: string }>;
};

export const AttendancePage: FC<Props> = ({ logs, filters, devices }) => {
  return (
    <MainLayout title="Attendance Logs" activePage="/admin/attendance">
      {/* Filters */}
      <form method="get" class="bg-white rounded-lg border p-4 mb-6">
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input type="date" name="from" value={filters.from || ''} class="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input type="date" name="to" value={filters.to || ''} class="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">PIN</label>
            <input type="text" name="pin" value={filters.pin || ''} placeholder="Employee PIN" class="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Device</label>
            <select name="device_sn" class="w-full border rounded px-2 py-1.5 text-sm">
              <option value="">All Devices</option>
              {devices.map(d => (
                <option value={d.serialNumber} selected={filters.device_sn === d.serialNumber}>{d.serialNumber}</option>
              ))}
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Sync Status</label>
            <select name="sync_status" class="w-full border rounded px-2 py-1.5 text-sm">
              <option value="">All</option>
              <option value="pending" selected={filters.sync_status === 'pending'}>Pending</option>
              <option value="synced" selected={filters.sync_status === 'synced'}>Synced</option>
              <option value="failed" selected={filters.sync_status === 'failed'}>Failed</option>
            </select>
          </div>
        </div>
        <div class="mt-3 flex gap-2">
          <button type="submit" class="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700">Filter</button>
          <a href="/admin/attendance" class="px-4 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Clear</a>
        </div>
      </form>

      {/* Table */}
      <div class="bg-white rounded-lg border overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PIN</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Verify</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sync</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Received</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            {logs.map(log => (
              <tr class="text-sm hover:bg-gray-50">
                <td class="px-4 py-2 whitespace-nowrap font-mono text-gray-900">{log.timestamp}</td>
                <td class="px-4 py-2 text-gray-700">{log.pin}</td>
                <td class="px-4 py-2 text-gray-700">{log.deviceSN}</td>
                <td class="px-4 py-2">
                  <span class={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                    log.status === 0 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>{STATUS_LABELS[log.status] || `Status ${log.status}`}</span>
                </td>
                <td class="px-4 py-2 text-xs text-gray-500">{VERIFY_LABELS[log.verifyMode] || 'Unknown'}</td>
                <td class="px-4 py-2">
                  <span class={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                    log.syncStatus === 'synced' ? 'bg-green-100 text-green-700' :
                    log.syncStatus === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{log.syncStatus || 'pending'}</span>
                </td>
                <td class="px-4 py-2 text-xs text-gray-400">{log.createdAt}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colspan={7} class="px-4 py-8 text-center text-gray-400 text-sm">No records found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-xs text-gray-400">Showing {logs.length} records</p>
    </MainLayout>
  );
};
