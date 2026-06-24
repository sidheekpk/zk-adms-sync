import type { FC } from 'hono/jsx';
import { MainLayout } from '../layouts/main.js';

export const LiveFeedPage: FC = () => {
  return (
    <MainLayout title="Live Feed" activePage="/admin/live">
      <div class="bg-white rounded-lg border">
        <div class="px-4 py-3 border-b flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="relative flex h-3 w-3">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <h3 class="text-sm font-medium text-gray-700">Real-time Attendance Feed</h3>
          </div>
          <span id="connection-status" class="text-xs text-gray-400">Connecting...</span>
        </div>
        <div class="overflow-x-auto" style="max-height: 70vh; overflow-y: auto;">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50 sticky top-0">
              <tr>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">PIN</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Verify</th>
              </tr>
            </thead>
            <tbody id="live-feed" class="divide-y divide-gray-200">
              <tr id="live-placeholder">
                <td colspan={5} class="px-4 py-8 text-center text-gray-400 text-sm">
                  Waiting for attendance events...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <script>{`
        const statusLabels = {0:'Check-In',1:'Check-Out',2:'Break-Out',3:'Break-In',4:'OT-In',5:'OT-Out'};
        const verifyLabels = {0:'Password',1:'Fingerprint',2:'Card',4:'Palm',9:'Face',15:'Face'};
        const feed = document.getElementById('live-feed');
        const statusEl = document.getElementById('connection-status');
        const placeholder = document.getElementById('live-placeholder');

        function connect() {
          const es = new EventSource('/api/dashboard/sse');

          es.onopen = () => {
            statusEl.textContent = 'Connected';
            statusEl.className = 'text-xs text-green-600';
          };

          es.onerror = () => {
            statusEl.textContent = 'Reconnecting...';
            statusEl.className = 'text-xs text-red-500';
          };

          es.addEventListener('attendance:new', (e) => {
            const data = JSON.parse(e.data);
            if (placeholder) placeholder.remove();

            const statusClass = data.status === 0 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700';
            const row = document.createElement('tr');
            row.className = 'text-sm bg-green-50 transition-colors';
            row.innerHTML =
              '<td class="px-4 py-2 whitespace-nowrap font-mono">' + data.timestamp + '</td>' +
              '<td class="px-4 py-2">' + data.pin + '</td>' +
              '<td class="px-4 py-2">' + (data.deviceName || data.deviceSN) + '</td>' +
              '<td class="px-4 py-2"><span class="inline-flex px-2 py-0.5 text-xs rounded-full ' + statusClass + '">' + (statusLabels[data.status] || 'Status ' + data.status) + '</span></td>' +
              '<td class="px-4 py-2 text-xs text-gray-500">' + (verifyLabels[data.verifyMode] || 'Unknown') + '</td>';

            feed.prepend(row);
            setTimeout(() => { row.className = 'text-sm transition-colors'; }, 2000);

            // Keep max 200 rows
            while (feed.children.length > 200) feed.lastChild.remove();
          });

          es.addEventListener('device:online', (e) => {
            const data = JSON.parse(e.data);
            console.log('Device online:', data);
          });

          es.addEventListener('device:offline', (e) => {
            const data = JSON.parse(e.data);
            console.log('Device offline:', data);
          });
        }

        connect();
      `}</script>
    </MainLayout>
  );
};
