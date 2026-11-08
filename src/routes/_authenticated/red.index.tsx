import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { TableFeedback } from "@/components/table-feedback";
import { EmptyRow } from "@/components/form-bits";
import { CATEGORIAS } from "@/lib/kyb";
import { formatDate } from "@/lib/format";
import { pageMeta } from "@/lib/metadata";
import { cn } from "@/lib/utils";
import { aprobadosInactivos, negociosVisibles } from "@/lib/red";

const FILTROS = [
  { valor: "en_revision", etiqueta: "En revisión" },
  { valor: "aprobado", etiqueta: "Aprobados" },
  { valor: "rechazado", etiqueta: "Rechazados" },
  { valor: "borrador", etiqueta: "Borradores" },
  { valor: "todos", etiqueta: "Todos" },
] as const;
type Filtro = (typeof FILTROS)[number]["valor"];

export const Route = createFileRoute("/_authenticated/red/")({
  validateSearch: (s) =>
    z
      .object({
        estado: z
          .enum(["en_revision", "aprobado", "rechazado", "borrador", "todos"])
          .optional()
          .catch(undefined),
        // En "Aprobados" los negocios inactivos se ocultan salvo con ?inactivos=true.
        inactivos: z.boolean().optional().catch(undefined),
      })
      .parse(s),
  head: () => pageMeta("Red Handle", "Revisión de expedientes de los negocios afiliados."),
  component: ColaDeRevision,
});

const etiquetaCategoria = (valor: string) =>
  CATEGORIAS.find((c) => c.valor === valor)?.etiqueta ?? valor;

function ColaDeRevision() {
  const search = Route.useSearch();
  const estado: Filtro = search.estado ?? "en_revision";
  const verInactivos = search.inactivos ?? false;
  const navigate = useNavigate({ from: Route.fullPath });
  // La red ve todos los negocios (RLS: is_admin_red). Los más antiguos primero: se atienden en orden.
  const q = useQuery({
    queryKey: ["red-negocios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, nombre_comercial, categoria, estado_kyb, updated_at, lat, activo, recomendado")
        .order("updated_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
  const todos = q.data ?? [];
  const cuenta = (f: Filtro) => negociosVisibles(todos, f, verInactivos).length;
  const visibles = negociosVisibles(todos, estado, verInactivos);
  const inactivos = aprobadosInactivos(todos);

  return (
    <>
      <PageHeader
        title="Red Handle"
        description="Revisa los expedientes de los negocios que quieren afiliarse."
      />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por estado">
        {FILTROS.map((f) => (
          <Button
            key={f.valor}
            role="tab"
            aria-selected={estado === f.valor}
            size="sm"
            variant={estado === f.valor ? "default" : "outline"}
            onClick={() =>
              navigate({
                search: { estado: f.valor, ...(verInactivos ? { inactivos: true } : {}) },
                replace: true,
              })
            }
          >
            {f.etiqueta}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs",
                estado === f.valor ? "bg-primary-foreground/20" : "bg-muted",
              )}
            >
              {cuenta(f.valor)}
            </span>
          </Button>
        ))}
      </div>
      {estado === "aprobado" && (
        <div className="mb-4 flex items-center gap-2">
          <Switch
            id="ver-inactivos"
            checked={verInactivos}
            onCheckedChange={(v) =>
              navigate({
                search: { estado, ...(v ? { inactivos: true } : {}) },
                replace: true,
              })
            }
          />
          <Label htmlFor="ver-inactivos" className="text-sm font-normal text-muted-foreground">
            Mostrar negocios inactivos ({inactivos})
          </Label>
        </div>
      )}
      <Card className="shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Negocio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Última actualización</TableHead>
              <TableHead>Mapa</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableFeedback
              cols={5}
              loading={q.isPending}
              error={q.error}
              retry={() => q.refetch()}
            />
            {!q.isPending && !q.error && visibles.length === 0 && (
              <EmptyRow
                cols={5}
                text={
                  estado === "en_revision"
                    ? "No hay expedientes esperando revisión."
                    : "No hay negocios en este estado."
                }
              />
            )}
            {visibles.map((n) => (
              <TableRow key={n.id}>
                <TableCell>
                  <p className="font-medium">
                    {n.nombre_comercial}
                    {n.recomendado && (
                      <span className="ml-1 text-amber-500" title="Recomendado en el mapa">
                        ★
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{etiquetaCategoria(n.categoria)}</p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={n.estado_kyb} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(n.updated_at)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {n.estado_kyb !== "aprobado"
                    ? "—"
                    : !n.activo
                      ? "Inactivo"
                      : n.lat != null
                        ? "Ubicado"
                        : "Sin ubicar"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    asChild
                    size="sm"
                    variant={n.estado_kyb === "en_revision" ? "default" : "ghost"}
                  >
                    <Link to="/red/$id" params={{ id: n.id }}>
                      {n.estado_kyb === "en_revision" ? "Revisar" : "Ver"}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
