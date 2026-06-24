import { PageHeader } from '@/components/page-header';
import { NewTenantForm } from './new-tenant-form';

export default function NewTenantPage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Platform', href: '/dashboard' },
          { label: 'Tenants', href: '/tenants' },
          { label: 'New' },
        ]}
        title="Add tenant"
        description="Provisions a new Postgres schema, sets the operator password, and prepares the device-enrollment flow."
      />
      <main className="flex-1 px-6 py-6">
        <NewTenantForm />
      </main>
    </>
  );
}
