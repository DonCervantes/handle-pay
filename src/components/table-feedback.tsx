import { useEffect } from "react";
import { toast } from "sonner";
import { AlertCircle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function TableFeedback({ cols, loading, error, retry }: { cols: number; loading?: boolean; error?: unknown; retry: () => void }) {
  useEffect(() => { if (error) toast.error("No pudimos cargar los datos. Intenta de nuevo."); }, [error]);
  if (loading) return <>{Array.from({ length: 5 }, (_, i) => <tr key={i} aria-label="Cargando datos"><td colSpan={cols} className="p-3"><Skeleton className="h-8 w-full" /></td></tr>)}</>;
  if (!error) return null;
  return <tr><td colSpan={cols} className="p-8 text-center"><AlertCircle className="mx-auto mb-3 size-6 text-destructive" /><p className="mb-3 text-sm text-muted-foreground">No pudimos cargar los datos.</p><Button variant="outline" onClick={retry}><RefreshCw /> Reintentar</Button></td></tr>;
}

export function EmptyState({ text, children }: { text: string; children?: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-3 py-5"><Inbox className="size-7 text-gold" /><p className="max-w-sm text-sm text-muted-foreground">{text}</p>{children}</div>;
}