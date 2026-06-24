import type { FC } from 'hono/jsx';
import { MainLayout } from '../layouts/main.js';
import { StatsCard } from '../components/stats-card.js';
import { STATUS_LABELS, VERIFY_LABELS } from '../../adms/constants.js';

type Props = {
  stats: {
    devicesOnline: number;
    devicesTotal: number;
    todayCount: number;
    pendingCount: number;
    syncedCount: number;
    failedCount: number;
  };
  recentLogs: Array<{
    id: number;
    deviceSN: string;
    pin: string;
    timestamp: string;
    status: number;
    verifyMode: number;
    syncStatus: string | null;
  }>;
};

export const DashboardPage: FC<Props> = ({ stats, recentLogs }) => {
  return (
    <MainLayout title="Dashboard" activePage="/admin/dashboard">
      {/* Stats Grid */}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard label="Devices Online" value={`${stats.devicesOnline}/${stats.devicesTotal}`} color="green" />
        <StatsCard label="Today's Punches" value={stats.todayCount} color="blue" />
        <StatsCard label="Pending Sync" value={stats.pendingCount} color="yellow" />
        <StatsCard label="Failed Sync" value={stats.failedCount} color="red" />
      </div>

      {/* Sync Progress */}
      <div class="bg-white rounded-lg border p-4 mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-2">Sync Progress</h3>
        <div class="flex items-center gap-4">
          <div class="flex-1 bg-gray-200 rounded-full h-3">
            {stats.syncedCount + stats.pendingCount + stats.failedCount > 0 && (
              <div
                class="bg-green-500 h-3 rounded-full transition-all"
                style={`width: ${Math.round((stats.syncedCount / (stats.syncedCount + stats.pendingCount + stats.failedCount)) * 100)}%`}
              ></div>
            )}
          </div>
          <span class="text-sm text-gray-600">{stats.syncedCount} synced</span>
        </div>
      </div>

      {/* Recent Attendance */}
      <div class="bg-white rounded-lg border">
        <div class="px-4 py-3 border-b flex items-center justify-between">
          <h3 class="text-sm font-medium text-gray-700">Recent Attendance</h3>
          <a href="/admin/attendance" class="text-xs text-blue-600 hover:underline">View All</a>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">PIN</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Verify</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sync</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200" id="recent-attendance">
              {recentLogs.map(log => (
                <tr class="text-sm">
                  <td class="px-4 py-2 text-gray-900 whitespace-nowrap">{log.timestamp}</td>
                  <td class="px-4 py-2 text-gray-700">{log.pin}</td>
                  <td class="px-4 py-2 text-gray-700">{log.deviceSN}</td>
                  <td class="px-4 py-2">
                    <span class={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                      log.status === 0 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {STATUS_LABELS[log.status] || `Status ${log.status}`}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-gray-500 text-xs">{VERIFY_LABELS[log.verifyMode] || 'Unknown'}</td>
                  <td class="px-4 py-2">
                    <span class={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                      log.syncStatus === 'synced' ? 'bg-green-100 text-green-700' :
                      log.syncStatus === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {log.syncStatus || 'pending'}
                    </span>
                  </td>
                </tr>
              ))}
              {recentLogs.length === 0 && (
                <tr>
                  <td colspan={6} class="px-4 py-8 text-center text-gray-400 text-sm">
                    No attendance records yet. Connect a device to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
};
