import type { FC, PropsWithChildren } from 'hono/jsx';

type Props = PropsWithChildren<{
  title?: string;
  activePage?: string;
}>;

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: '⊞' },
  { href: '/admin/devices', label: 'Devices', icon: '⊡' },
  { href: '/admin/attendance', label: 'Attendance', icon: '⊟' },
  { href: '/admin/live', label: 'Live Feed', icon: '⊙' },
  { href: '/admin/sync', label: 'Sync', icon: '⇄' },
  { href: '/admin/commands', label: 'Commands', icon: '⊳' },
];

export const MainLayout: FC<Props> = ({ children, title = 'ZK Connect', activePage }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} - ZK Connect</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="/public/htmx.min.js"></script>
        <style>{`
          [hx-indicator] .htmx-indicator { display: none; }
          [hx-indicator].htmx-request .htmx-indicator { display: inline; }
        `}</style>
      </head>
      <body class="bg-gray-50 min-h-screen">
        <div class="flex min-h-screen">
          {/* Sidebar */}
          <aside class="w-64 bg-gray-900 text-white flex-shrink-0">
            <div class="p-4 border-b border-gray-700">
              <h1 class="text-xl font-bold tracking-tight">ZK Connect</h1>
              <p class="text-xs text-gray-400 mt-1">ADMS Bridge</p>
            </div>
            <nav class="p-2">
              {navItems.map(item => (
                <a
                  href={item.href}
                  class={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    activePage === item.href
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <span class="text-lg">{item.icon}</span>
                  {item.label}
                </a>
              ))}
            </nav>
            <div class="absolute bottom-0 w-64 p-4 border-t border-gray-700">
              <a href="/admin/logout" class="text-sm text-gray-400 hover:text-white">Logout</a>
            </div>
          </aside>

          {/* Main content */}
          <main class="flex-1 overflow-auto">
            <header class="bg-white border-b px-6 py-4">
              <h2 class="text-lg font-semibold text-gray-800">{title}</h2>
            </header>
            <div class="p-6">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
};
