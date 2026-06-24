'use client';

import { usePathname } from 'next/navigation';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { NotificationBar } from '@/components/notification-bar';

interface User {
  id: string;
  email: string;
  name: string | null;
  isSuperAdmin: boolean;
}

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname();
  const tenantSlugMatch = pathname.match(/^\/t\/([^/]+)/);
  const tenantSlug = tenantSlugMatch?.[1];
  const scope = tenantSlug ? 'tenant' : 'platform';

  return (
    <SidebarProvider>
      <AppSidebar scope={scope} tenantSlug={tenantSlug} user={user} />
      <SidebarInset>
        <div className="flex min-h-screen flex-col">
          <NotificationBar />
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
