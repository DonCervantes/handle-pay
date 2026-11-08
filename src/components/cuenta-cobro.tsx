import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Landmark, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { FormField } from "@/components/form-bits";
import { actualizarCuentaCodi, registrarCuentaCodi } from "@/lib/cobros.functions";
import { cuentaCobroQuery } from "@/lib/negocio-data";
import { validarClabe } from "@/lib/codi";

const mensaje = (e: unknown) =>
  e instanceof Error ? e.message : "Algo salió mal. Intenta de nuevo.";

/** HND-031: conectar la cuenta bancaria donde el negocio recibe sus cobros CoDi. */
export function CuentaCobro({ titularSugerido }: { titularSugerido: string }) {
  const qc = useQueryClient();
  const { data: cuenta, isPending } = useQuery(cuentaCobroQuery);
  const registrarFn = useServerFn(registrarCuentaCodi);
  const actualizarFn = useServerFn(actualizarCuentaCodi);
  const [clabe, setClabe] = useState("");
  const [titular, setTitular] = useState(titularSugerido);
  const [errorClabe, setErrorClabe] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function registrar(e: FormEvent) {
    e.preventDefault();
    const error = validarClabe(clabe);
    setErrorClabe(error);
    if (error) return;
    setOcupado(true);
    try {
      const r = await registrarFn({ data: { clabe, titular } });
      toast.success(
        r.estado === "activa" ? "Cuenta de cobro activa" : "Cuenta enviada a registro con Banxico",
      );
      setClabe("");
      await qc.invalidateQueries({ queryKey: ["cuenta-cobro"] });
    } catch (err) {
      toast.error(mensaje(err));
    } finally {
      setOcupado(false);
    }
  }

  async function actualizar() {
    setOcupado(true);
    try {
      const r = await actualizarFn();
      toast.success(
        r.estado === "activa"
          ? "¡Tu cuenta ya está activa para cobrar!"
          : "Tu cuenta sigue en registro.",
      );
      await qc.invalidateQueries({ queryKey: ["cuenta-cobro"] });
    } catch (err) {
      toast.error(mensaje(err));
    } finally {
      setOcupado(false);
    }
  }

  if (isPending) return null;
  const necesitaRegistro = !cuenta || cuenta.estado === "error";

  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="size-4" /> Cuenta de cobro CoDi
          </CardTitle>
          {cuenta && <StatusBadge status={cuenta.estado} />}
        </div>
        <p className="text-sm text-muted-foreground">
          La cuenta bancaria donde te llega el dinero de cada cobro. El registro con Banxico tarda
          alrededor de 5 días hábiles.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {cuenta && (
          <div className="rounded-md border px-4 py-3 text-sm">
            <p>
              <span className="text-muted-foreground">Titular:</span> {cuenta.titular ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">CLABE:</span>{" "}
              <span className="font-mono">•••• •••• •••• ••{cuenta.clabe_ultimos4 ?? "••••"}</span>
            </p>
            {cuenta.estado === "en_registro" && (
              <p className="mt-2 text-muted-foreground">
                Te avisaremos cuando quede activa. Mientras, aún no puedes cobrar.
              </p>
            )}
            {cuenta.estado === "activa" && (
              <p className="mt-2 font-medium text-success">
                Lista: ya puedes cobrar desde la Caja.
              </p>
            )}
            {cuenta.estado === "error" && (
              <p className="mt-2 text-destructive" role="alert">
                Banxico no pudo registrar la cuenta
                {cuenta.error_mensaje ? `: ${cuenta.error_mensaje}` : ""}. Revisa la CLABE y vuelve
                a registrarla.
              </p>
            )}
          </div>
        )}

        {cuenta?.estado === "en_registro" && (
          <Button variant="outline" disabled={ocupado} onClick={() => void actualizar()}>
            {ocupado ? <Loader2 className="animate-spin" /> : <RefreshCw />} Consultar estado
          </Button>
        )}

        {necesitaRegistro && (
          <form onSubmit={registrar} className="grid gap-4 sm:grid-cols-2">
            <div>
              <FormField label="CLABE interbancaria (18 dígitos)" htmlFor="clabe">
                <Input
                  id="clabe"
                  inputMode="numeric"
                  value={clabe}
                  onChange={(e) => {
                    setClabe(e.target.value);
                    setErrorClabe(null);
                  }}
                  placeholder="012 180 0012345678 99"
                  maxLength={24}
                  className="font-mono"
                />
              </FormField>
              {errorClabe && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {errorClabe}
                </p>
              )}
            </div>
            <FormField label="Titular de la cuenta" htmlFor="titular">
              <Input
                id="titular"
                value={titular}
                onChange={(e) => setTitular(e.target.value)}
                maxLength={255}
                required
              />
            </FormField>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Debe ser la misma cuenta del estado de cuenta que subiste en tu expediente. Solo
              guardamos los últimos 4 dígitos.
            </p>
            <div className="sm:col-span-2">
              <Button disabled={ocupado}>
                {ocupado && <Loader2 className="animate-spin" />} Conectar cuenta
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
