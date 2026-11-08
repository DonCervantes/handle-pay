import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyRow, NativeSelect } from "@/components/form-bits";
import { TableFeedback } from "@/components/table-feedback";
import { misClientes } from "@/lib/clientes.functions";
import {
  NIVELES_FILTRO,
  ORDENES,
  busquedaClientes,
  filtrarClientes,
  nombreCliente,
  totalesClientes,
} from "@/lib/clientes";
import { NIVELES, formatPuntos } from "@/lib/puntos";
import { formatDate, formatMXN } from "@/lib/format";
import { pageMeta } from "@/lib/metadata";
import { NivelBadge } from "@/components/nivel-badge";

export const Route = createFileRoute("/_authenticated/clientes/")({
  validateSearch: busquedaClientes,
  head: () => pageMeta("Clientes", "Los clientes que compran en tu changarro, con sus puntos y su nivel."),
  component: Clientes,
});

const COLUMNAS = 6;

/** T21: clientes reales del changarro (los que pagaron con CoDi o tienen puntos aquí). */
function Clientes() {
  const busqueda = Route.useSearch();
  const navigate = Route.useNavigate();
  const clientesFn = useServerFn(misClientes);
  const q = useQuery({ queryKey: ["clientes-negocio"], queryFn: () => clientesFn() });
  const todos = q.data ?? [];
  const filas = filtrarClientes(todos, busqueda);
  const totales = totalesClientes(todos);
  const hayFiltros = !!(busqueda.q || busqueda.nivel);
  const cambiar = (cambio: Partial<typeof busqueda>) =>
    navigate({ search: (prev) => ({ ...prev, ...cambio }), replace: true });
  const limpiar = () => cambiar({ q: "", nivel: "" });

  return (
    <>
      <PageHeader
        title="Clientes"
        description={
          q.isPending
            ? "Quienes compran en tu changarro."
            : `${totales.clientes} ${totales.clientes === 1 ? "cliente" : "clientes"} · ${totales.recurrentes} recurrentes · ${formatPuntos(totales.puntos)} puntos por usar`
        }
      />
      <Card className="shadow-card">
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[minmax(0,1fr)_10rem_12rem_auto]">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              aria-label="Buscar clientes"
              placeholder="Buscar por nombre o correo"
              className="pl-9"
              value={busqueda.q}
              onChange={(e) => cambiar({ q: e.target.value })}
            />
          </div>
          <NativeSelect
            aria-label="Filtrar por nivel"
            value={busqueda.nivel}
            onChange={(e) => cambiar({ nivel: e.target.value as typeof busqueda.nivel })}
          >
            <option value="">Todos los niveles</option>
            {NIVELES_FILTRO.map((n) => (
              <option key={n} value={n}>
                {NIVELES[n].nombre}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Ordenar clientes"
            value={busqueda.orden}
            onChange={(e) => cambiar({ orden: e.target.value as typeof busqueda.orden })}
          >
            {ORDENES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </NativeSelect>
          {hayFiltros && (
            <Button variant="ghost" onClick={limpiar}>
              Limpiar
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="hidden md:table-cell">Nivel</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Compras</TableHead>
              <TableHead className="text-right">Total gastado</TableHead>
              <TableHead className="text-right">Puntos</TableHead>
              <TableHead className="hidden lg:table-cell">Última visita</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableFeedback cols={COLUMNAS} loading={q.isPending} error={q.error} retry={() => q.refetch()} />
            {!q.isPending && !q.error && !filas.length && (
              <EmptyRow
                cols={COLUMNAS}
                text={
                  todos.length
                    ? "No encontramos clientes con estos filtros."
                    : "Aún no tienes clientes. Cuando cobres en la caja con el correo del cliente, aparecerá aquí con sus puntos."
                }
                action={
                  todos.length ? (
                    <Button variant="outline" onClick={limpiar}>
                      Limpiar filtros
                    </Button>
                  ) : undefined
                }
              />
            )}
            {filas.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="min-w-0">
                  <Link
                    to="/clientes/$id"
                    params={{ id: c.id }}
                    className="font-semibold hover:text-gold"
                  >
                    {nombreCliente(c)}
                  </Link>
                  <p className="break-all text-xs text-muted-foreground">{c.email}</p>
                  <NivelBadge nivel={c.nivel} className="mt-1 md:hidden" />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <NivelBadge nivel={c.nivel} />
                </TableCell>
                <TableCell className="tabular hidden text-right sm:table-cell">{c.compras}</TableCell>
                <TableCell className="tabular whitespace-nowrap text-right font-medium">
                  {formatMXN(c.totalGastado)}
                </TableCell>
                <TableCell className="tabular whitespace-nowrap text-right">{formatPuntos(c.puntos)}</TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                  {formatDate(c.ultimaVisita)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
