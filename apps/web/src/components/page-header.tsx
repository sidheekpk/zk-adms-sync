import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:gap-3 sm:px-6 sm:py-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 h-4 sm:mr-2" />
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center overflow-hidden text-xs text-muted-foreground sm:text-sm">
            {breadcrumbs.map((c, i) => (
              <span key={i} className="flex items-center truncate">
                {i > 0 && <ChevronRight className="mx-0.5 h-3 w-3 flex-shrink-0 sm:mx-1 sm:h-3.5 sm:w-3.5" />}
                {c.href ? (
                  <Link href={c.href} className="truncate hover:text-foreground">
                    {c.label}
                  </Link>
                ) : (
                  <span className="truncate">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
