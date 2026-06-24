'use client';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Cpu } from 'lucide-react';

export default function PlatformDevicesPage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Platform', href: '/dashboard' }, { label: 'All devices' }]}
        title="All devices"
        description="Every device across every tenant."
      />
      <main className="flex-1 px-6 py-6">
        <Card>
          <CardContent className="py-16 text-center">
            <Cpu className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Cross-tenant device view</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Populates once the ADMS service is wired to Postgres (Phase 4).
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
