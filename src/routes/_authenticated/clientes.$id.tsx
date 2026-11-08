import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyRow } from "@/components/form-bits";
import { StatusBadge } from "@/components/status-badge";
import { NivelBadge } from "@/components/nivel-badge";
import { fichaCliente } from "@/lib/clientes.functions";
import { nombreCliente } from "@/lib/clientes";
import { TIPO_MOVIMIENTO, formatPuntos } from "@/lib/puntos";
import { formatDate, formatMXN } from "@/lib/format";
import { pageMeta } from "@/lib/metadata";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clientes/$id")({
  head: () => pageMeta("Ficha de cliente", "Compras y puntos de un cliente en tu changarro."),
  component: ClienteDetalle,
});

const volver = { q: "", nivel: "" as const, orden: "reciente" as const };

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function Regresar() {
  return (
    <Button asChild variant="ghost" className="mb-6">
      <Link to="/clientes" search={volver}>
        <ArrowLeft /> Clientes
      </Link>
    </Button>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="tabular truncate text-lg font-semibold">{valor}</p>
    </div>
  );
}

/** T21: ficha de un cliente del changarro con su historial de cobros y de puntos. */
function ClienteDetalle() {
  const { id } = Route.useParams();
  const fichaFn = useServerFn(fichaCliente);
  const q = useQuery({ queryKey: ["clientes-negocio", id], queryFn: () => fichaFn({ data: { id } }) });

  if (q.isPending) {
    return (
      <>
        <Regresar />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando la ficha…
        </p>
      </>
    );
  }
  if (q.error) {
    return (
      <>
        <Regresar />
        <p className="text-sm text-destructive">No pudimos cargar la ficha del cliente.</p>
        <Button variant="outline" className="mt-3" onClick={() => q.refetch()}>
          Reintentar
        </Button>
      </>
    );
  }
  if (!q.data) {
    return (
      <>
        <Regresar />
        <p className="text-sm text-muted-foreground">
          Cliente no encontrado. Solo ves a quienes han comprado en tu changarro.
        </p>
      </>
    );
  }

  const { cliente: c, cobros, movimientos, totalCobros, puntosVencidos } = q.data;
  return (
    <>
      <Regresar />
      <div className="mb-6 min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="break-words text-2xl font-bold">{nombreCliente(c)}</h1>
          <NivelBadge nivel={c.nivel} />
        </div>
        <a
          href={`mailto:${c.email}`}
          className="mt-2 inline-flex min-w-0 items-center gap-2 break-all text-sm text-muted-foreground"
        >
          <Mail className="size-4 shrink-0" />
          {c.email}
        </a>
      </div>

      <Card className="mb-6 shadow-card">
        <CardContent className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
          <Dato etiqueta="Puntos por usar aquí" valor={formatPuntos(c.puntos)} />
          <Dato etiqueta="Compras pagadas" valor={String(c.compras)} />
          <Dato etiqueta="Total gastado" valor={formatMXN(c.totalGastado)} />
          <Dato etiqueta="Última visita" valor={formatDate(c.ultimaVisita)} />
        </CardContent>
        {(c.primeraVisita || puntosVencidos) && (
          <p className="px-5 pb-4 text-xs text-muted-foreground">
            {c.primeraVisita && `Cliente desde el ${formatDate(c.primeraVisita)}. `}
            {puntosVencidos && "Tenía puntos que vencieron por no volver a tiempo."}
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0 shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Cobros</CardTitle>
            {totalCobros > cobros.length && (
              <p className="text-xs text-muted-foreground">
                Mostrando los {cobros.length} más recientes de {totalCobros}.
              </p>
            )}
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Con puntos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!cobros.length && <EmptyRow cols={4} text="Aún no hay cobros de este cliente." />}
              {cobros.map((cobro) => (
                <TableRow key={cobro.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {fechaHora(cobro.fecha)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={cobro.estado} />
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right font-medium">
                    {formatMXN(cobro.monto)}
                  </TableCell>
                  <TableCell className="tabular hidden whitespace-nowrap text-right text-muted-foreground sm:table-cell">
                    {cobro.descuento > 0 ? `−${formatMXN(cobro.descuento)}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="min-w-0 shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Movimientos de puntos</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Movimiento</TableHead>
                <TableHead className="text-right">Puntos</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!movimientos.length && (
                <EmptyRow cols={4} text="Aún no hay movimientos de puntos de este cliente." />
              )}
              {movimientos.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(m.fecha)}
                  </TableCell>
                  <TableCell>{TIPO_MOVIMIENTO[m.tipo] ?? m.tipo}</TableCell>
                  <TableCell
                    className={cn(
                      "tabular whitespace-nowrap text-right font-medium",
                      m.puntos > 0 ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {m.puntos > 0 ? "+" : "−"}
                    {formatPuntos(Math.abs(m.puntos))}
                  </TableCell>
                  <TableCell className="tabular hidden whitespace-nowrap text-right sm:table-cell">
                    {formatPuntos(m.saldo)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
