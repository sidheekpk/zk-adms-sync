'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Building2, ArrowRight, Pencil } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatRelative } from 'date-fns';

export default function TenantsPage() {
  const router = useRouter();
  const list = trpc.tenants.listAll.useQuery();

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Platform', href: '/dashboard' }, { label: 'Tenants' }]}
        title="Tenants"
        description="Each client gets its own Postgres schema, operator password, and audit boundary."
        actions={
          <Button onClick={() => router.push('/tenants/new')}>
            <Plus className="mr-2 h-4 w-4" /> Add tenant
          </Button>
        }
      />
      <main className="flex-1 px-6 py-6">
        <Card>
          <CardContent className="p-0">
            {!list.data ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : list.data.length === 0 ? (
              <div className="py-16 text-center">
                <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">No tenants yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add your first client to start onboarding devices.
                </p>
                <Button className="mt-6" onClick={() => router.push('/tenants/new')}>
                  <Plus className="mr-2 h-4 w-4" /> Add tenant
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-4 font-medium">Name</th>
                      <th className="p-4 font-medium">Slug</th>
                      <th className="p-4 font-medium">Timezone</th>
                      <th className="p-4 font-medium">Isolation</th>
                      <th className="p-4 font-medium">Status</th>
                      <th className="p-4 font-medium">Created</th>
                      <th className="p-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.map((t) => (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-4 font-medium">{t.name}</td>
                        <td className="p-4 font-mono text-xs text-muted-foreground">{t.slug}</td>
                        <td className="p-4">{t.timezone}</td>
                        <td className="p-4">
                          <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">
                            {t.isolationMode}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">
                            {t.status}
                          </span>
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {formatRelative(new Date(t.createdAt), new Date())}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/tenants/${t.id}/edit`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/t/${t.slug}/dashboard`}>
                                Open <ArrowRight className="ml-1 h-4 w-4" />
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
