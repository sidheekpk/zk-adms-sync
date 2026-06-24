'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Cpu,
  ShieldCheck,
  Users,
  Clock,
  ScrollText,
  Settings,
  ChevronsUpDown,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Plus,
  Check,
  Plug,
  BarChart3,
} from 'lucide-react';
import { useTheme } from 'next-themes';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { signOut } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

interface AppSidebarProps {
  scope: 'platform' | 'tenant';
  tenantSlug?: string;
  user: { id: string; email: string; name: string | null; isSuperAdmin: boolean };
}

export function AppSidebar({ scope, tenantSlug, user }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const tenantsQuery = trpc.tenants.listMine.useQuery(undefined, {
    enabled: !!user,
  });
  const activeTenantName = React.useMemo(() => {
    if (scope !== 'tenant' || !tenantSlug) return undefined;
    return tenantsQuery.data?.find((t) => t.slug === tenantSlug)?.name;
  }, [scope, tenantSlug, tenantsQuery.data]);

  const platformNav = [
    { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Tenants', href: '/tenants', icon: Building2 },
    { label: 'All devices', href: '/devices', icon: Cpu },
    { label: 'Audit log', href: '/audit', icon: ShieldCheck },
  ];

  // Integrations entry parked until Phase 6 (sync to Radix / custom webhooks).
  // Backend (router, worker, schemas, encryption) is shipped and inert.
  // Toggle ENABLE_INTEGRATIONS_UI=1 in env to surface the entry locally.
  const showIntegrations = process.env.NEXT_PUBLIC_ENABLE_INTEGRATIONS_UI === '1';
  const tenantNav = tenantSlug
    ? [
        { label: 'Dashboard', href: `/t/${tenantSlug}/dashboard`, icon: LayoutDashboard },
        { label: 'Devices', href: `/t/${tenantSlug}/devices`, icon: Cpu },
        { label: 'Members', href: `/t/${tenantSlug}/members`, icon: Users },
        { label: 'Attendance', href: `/t/${tenantSlug}/attendance`, icon: Clock },
        { label: 'Reports', href: `/t/${tenantSlug}/reports`, icon: BarChart3 },
        ...(showIntegrations
          ? [{ label: 'Integrations', href: `/t/${tenantSlug}/integrations`, icon: Plug }]
          : []),
        { label: 'Audit log', href: `/t/${tenantSlug}/audit`, icon: ScrollText },
        { label: 'Settings', href: `/t/${tenantSlug}/settings`, icon: Settings },
      ]
    : [];

  const nav = scope === 'platform' ? platformNav : tenantNav;
  const groupLabel = scope === 'platform' ? 'Platform' : 'Tenant';

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2.5">
                      <path d="M4 7h16M4 12h10M4 17h6" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {scope === 'tenant' ? activeTenantName ?? 'Tenant' : 'ZK Connect'}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {scope === 'tenant' ? `t/${tenantSlug}` : 'Platform'}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto h-4 w-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-64">
                {user.isSuperAdmin && (
                  <>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Platform
                    </DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => router.push('/dashboard')}>
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Platform overview
                      {scope === 'platform' && <Check className="ml-auto h-4 w-4" />}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Tenants
                </DropdownMenuLabel>
                {tenantsQuery.data && tenantsQuery.data.length > 0 ? (
                  <DropdownMenuGroup>
                    {tenantsQuery.data.map((t) => (
                      <DropdownMenuItem
                        key={t.id}
                        onClick={() => router.push(`/t/${t.slug}/dashboard`)}
                      >
                        <Building2 className="mr-2 h-4 w-4" />
                        <div className="flex-1">
                          <p className="text-sm">{t.name}</p>
                          <p className="text-xs text-muted-foreground">t/{t.slug}</p>
                        </div>
                        {scope === 'tenant' && tenantSlug === t.slug && (
                          <Check className="ml-2 h-4 w-4" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                ) : (
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                    No tenants yet
                  </DropdownMenuItem>
                )}
                {user.isSuperAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push('/tenants/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add tenant…
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-foreground text-background text-xs">
                      {user.email[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name ?? user.email}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.isSuperAdmin ? 'Super Admin' : 'Member'}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto h-4 w-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Theme
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setTheme('light')}>
                  <Sun className="mr-2 h-4 w-4" /> Light {theme === 'light' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')}>
                  <Moon className="mr-2 h-4 w-4" /> Dark {theme === 'dark' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')}>
                  <Monitor className="mr-2 h-4 w-4" /> System {theme === 'system' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    router.push('/login');
                    router.refresh();
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
