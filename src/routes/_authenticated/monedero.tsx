import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Award, Gift, Loader2, Store } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { miMonedero } from "@/lib/monedero.functions";
import { NIVELES, TIPO_MOVIMIENTO, formatPuntos, siguienteNivel } from "@/lib/puntos";
import { pageMeta } from "@/lib/metadata";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/monedero")({
  head: () => pageMeta("Mis puntos", "Tus puntos en los negocios de la red Handle."),
  component: Monedero,
});

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

/** HND-044 / HND-045: saldo por negocio, vencimiento, historial y nivel del cliente. */
function Monedero() {
  const monederoFn = useServerFn(miMonedero);
  const q = useQuery({ queryKey: ["monedero"], queryFn: () => monederoFn() });

  if (q.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando tus puntos…
      </p>
    );
  }
  if (q.error || !q.data) {
    return (
      <p className="text-sm text-destructive">No pudimos cargar tus puntos. Recarga la página.</p>
    );
  }

  const m = q.data;
  const nivel = NIVELES[m.nivel];
  const siguiente = siguienteNivel(m.nivel, m.compras);
  const avance = siguiente
    ? Math.min(100, Math.round((m.compras / NIVELES[siguiente.nivel].compras) * 100))
    : 100;

  return (
    <>
      <PageHeader
        title="Mis puntos"
        description="1 punto = $1 de descuento en el negocio donde lo ganaste."
      />
      <div className="space-y-6">
        <Card className="shadow-card">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground">
                <Award className="size-5" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Tu nivel</p>
                <p className="text-lg font-semibold">{nivel.nombre}</p>
              </div>
            </div>
            <p className="text-sm">{nivel.beneficio}.</p>
            {siguiente ? (
              <div className="space-y-1.5">
                <Progress value={avance} aria-label="Avance al siguiente nivel" />
                <p className="text-xs text-muted-foreground">
                  {siguiente.faltan === 1
                    ? "Te falta 1 compra"
                    : `Te faltan ${siguiente.faltan} compras`}{" "}
                  para ser {NIVELES[siguiente.nivel].nombre} (
                  {NIVELES[siguiente.nivel].beneficio.toLowerCase()}).
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Ya tienes el nivel más alto. ¡Gracias!
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="size-4" /> Tus saldos
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {m.saldos.length === 0 && (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Aún no tienes puntos. Da tu correo al pagar en un negocio de la red Handle y empieza
                a ganar.
              </p>
            )}
            {m.saldos.map((s) => (
              <div key={s.businessId} className="flex items-center gap-3 px-6 py-3">
                <Store className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.negocio}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.venceEl
                      ? `Vencen el ${fecha(s.venceEl)} si no vuelves a comprar`
                      : "No vencen"}
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{formatPuntos(s.saldo)} pts</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Movimientos</CardTitle>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {m.movimientos.length === 0 && (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Sin movimientos todavía.</p>
            )}
            {m.movimientos.map((mov) => (
              <div key={mov.id} className="flex items-center gap-3 px-6 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {mov.tipo === "ajuste"
                      ? mov.puntos > 0
                        ? "Te devolvimos"
                        : "Ajuste"
                      : (TIPO_MOVIMIENTO[mov.tipo] ?? mov.tipo)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {mov.negocio} · {fecha(mov.fecha)}
                  </p>
                </div>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    mov.puntos > 0 ? "text-success" : "text-muted-foreground",
                  )}
                >
                  {mov.puntos > 0 ? "+" : "−"}
                  {formatPuntos(Math.abs(mov.puntos))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
