import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold break-words">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-card/50 p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h3 className="font-bold">{title}</h3>
        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Próximamente</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
