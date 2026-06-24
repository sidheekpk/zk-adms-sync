import type { FC } from 'hono/jsx';
import { MainLayout } from '../layouts/main.js';

type SyncTarget = {
  id: number;
  name: string;
  url: string;
  method: string | null;
  authType: string | null;
  isActive: boolean | null;
  batchSize: number | null;
  retryAttempts: number | null;
  lastSyncAt: string | null;
  createdAt: string | null;
};

type SyncLogEntry = {
  id: number;
  syncTargetId: number;
  recordCount: number;
  status: string;
  httpStatus: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string | null;
};

type Props = {
  targets: SyncTarget[];
  history: SyncLogEntry[];
};

export const SyncPage: FC<Props> = ({ targets, history }) => {
  return (
    <MainLayout title="Sync Targets" activePage="/admin/sync">
      {/* Add New Target */}
      <div class="bg-white rounded-lg border p-4 mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-3">Add Sync Target</h3>
        <form method="post" action="/admin/sync" class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input type="text" name="name" required placeholder="RadixHR" class="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">URL</label>
            <input type="url" name="url" required placeholder="https://api.example.com/attendance" class="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Auth Type</label>
            <select name="authType" class="w-full border rounded px-2 py-1.5 text-sm">
              <option value="none">None</option>
              <option value="bearer">Bearer Token</option>
              <option value="api_key">API Key</option>
              <option value="basic">Basic Auth</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Auth Value</label>
            <input type="text" name="authValue" placeholder="Token or key" class="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Batch Size</label>
            <input type="number" name="batchSize" value="50" class="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div class="flex items-end">
            <button type="submit" class="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700">Add Target</button>
          </div>
        </form>
      </div>

      {/* Existing Targets */}
      <div class="space-y-4 mb-6">
        {targets.map(target => (
          <div class="bg-white rounded-lg border p-4">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-3">
                <h4 class="font-semibold text-gray-900">{target.name}</h4>
                <span class={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                  target.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>{target.isActive ? 'Active' : 'Inactive'}</span>
              </div>
              <div class="flex gap-2">
                <form method="post" action={`/admin/sync/${target.id}/test`} class="inline">
                  <button type="submit" class="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">Test</button>
                </form>
                <form method="post" action={`/admin/sync/${target.id}/toggle`} class="inline">
                  <button type="submit" class="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                    {target.isActive ? 'Disable' : 'Enable'}
                  </button>
                </form>
                <form method="post" action={`/admin/sync/${target.id}/delete`} class="inline">
                  <button type="submit" class="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    onclick="return confirm('Delete this sync target?')">Delete</button>
                </form>
              </div>
            </div>
            <div class="text-sm text-gray-500 space-y-1">
              <p>URL: <code class="bg-gray-100 px-1 rounded text-xs">{target.url}</code></p>
              <p>Method: {target.method || 'POST'} | Auth: {target.authType || 'none'} | Batch: {target.batchSize || 50}</p>
              {target.lastSyncAt && <p>Last sync: {target.lastSyncAt}</p>}
            </div>
          </div>
        ))}
        {targets.length === 0 && (
          <div class="bg-white rounded-lg border p-8 text-center text-gray-400 text-sm">
            No sync targets configured. Add one above to start forwarding attendance data.
          </div>
        )}
      </div>

      {/* Manual Sync */}
      <div class="mb-6">
        <form method="post" action="/admin/sync/trigger" class="inline">
          <button type="submit" class="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded hover:bg-green-700">
            Trigger Sync Now
          </button>
        </form>
      </div>

      {/* Sync History */}
      <div class="bg-white rounded-lg border">
        <div class="px-4 py-3 border-b">
          <h3 class="text-sm font-medium text-gray-700">Sync History</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Records</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">HTTP</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              {history.map(entry => (
                <tr class="text-sm">
                  <td class="px-4 py-2 text-gray-500 whitespace-nowrap">{entry.createdAt}</td>
                  <td class="px-4 py-2">{entry.syncTargetId}</td>
                  <td class="px-4 py-2">{entry.recordCount}</td>
                  <td class="px-4 py-2">
                    <span class={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                      entry.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>{entry.status}</span>
                  </td>
                  <td class="px-4 py-2 text-gray-500">{entry.httpStatus || '-'}</td>
                  <td class="px-4 py-2 text-gray-500">{entry.durationMs ? `${entry.durationMs}ms` : '-'}</td>
                  <td class="px-4 py-2 text-xs text-red-500 max-w-xs truncate">{entry.errorMessage || '-'}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colspan={7} class="px-4 py-6 text-center text-gray-400 text-sm">No sync history yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
};
