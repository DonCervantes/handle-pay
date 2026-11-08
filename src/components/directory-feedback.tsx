import { useEffect } from "react";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function DirectoryLoading() {
  return <div role="status" aria-label="Cargando datos" className="space-y-4"><Skeleton className="h-8 w-52" /><Skeleton className="h-12 w-full" />{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
}
export function DirectoryError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const boundary = useQueryErrorResetBoundary();
  useEffect(() => { toast.error("No pudimos cargar esta página. Intenta de nuevo."); }, [error]);
  return <div role="alert" className="space-y-4 py-12 text-center"><h1 className="text-xl font-bold">No pudimos cargar los datos</h1><p className="text-sm text-muted-foreground">Tus datos siguen guardados. Puedes intentarlo de nuevo.</p><Button variant="outline" onClick={() => { boundary.reset(); router.invalidate(); }}>Reintentar</Button></div>;
}
