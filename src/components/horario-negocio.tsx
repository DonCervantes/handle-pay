import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DIAS,
  erroresHorario,
  horarioATramos,
  horarioInicial,
  tramosAHorario,
  type DiaHorario,
} from "@/lib/horario";
import type { Negocio } from "@/lib/negocio-data";

/**
 * Horario de atención que se publica en el mapa (/mapa/$id). Lo edita la gerencia en cualquier
 * estado del expediente: no es dato fiscal, así que guard_business_write no lo bloquea.
 */
export function HorarioNegocio({ negocio }: { negocio: Pick<Negocio, "id" | "horario"> }) {
  const qc = useQueryClient();
  const [dias, setDias] = useState<DiaHorario[]>(
    () => tramosAHorario(negocio.horario) ?? horarioInicial(),
  );
  const [errores, setErrores] = useState<Record<number, string>>({});
  const [guardando, setGuardando] = useState(false);
  const publicado = Array.isArray(negocio.horario) && negocio.horario.length > 0;

  useEffect(() => {
    setDias(tramosAHorario(negocio.horario) ?? horarioInicial());
  }, [negocio.horario]);

  const cambiar = (i: number, cambio: Partial<DiaHorario>) => {
    setDias((ds) => ds.map((d, j) => (j === i ? { ...d, ...cambio } : d)));
    setErrores(({ [i]: _quitado, ...resto }) => resto);
  };

  const copiarLunes = () => {
    const lunes = dias[0]!;
    setDias((ds) => ds.map((d) => (d.abierto ? { ...d, abre: lunes.abre, cierra: lunes.cierra } : d)));
    setErrores({});
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const encontrados = erroresHorario(dias);
    setErrores(encontrados);
    if (Object.keys(encontrados).length) {
      toast.error("Revisa los días marcados.");
      return;
    }
    const tramos = horarioATramos(dias);
    setGuardando(true);
    const { error } = await supabase
      .from("businesses")
      .update({ horario: tramos.length ? tramos : null })
      .eq("id", negocio.id);
    setGuardando(false);
    if (error) {
      console.error("horario", error);
      toast.error("No pudimos guardar tu horario. Intenta de nuevo.");
      return;
    }
    toast.success(tramos.length ? "Horario guardado" : "Quitaste tu horario del mapa");
    await qc.invalidateQueries({ queryKey: ["mi-negocio"] });
  }

  const resumen = horarioATramos(dias);
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4" /> Horario de atención
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {publicado
            ? "Así aparece tu horario en el mapa de Handle."
            : "Aún no publicas tu horario. Guárdalo para que tus clientes sepan cuándo encontrarte en el mapa."}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={guardar} className="space-y-4">
          <fieldset disabled={guardando} className="divide-y rounded-md border">
            <legend className="sr-only">Horario por día</legend>
            {DIAS.map((nombre, i) => {
              const d = dias[i]!;
              const error = errores[i];
              return (
                <div key={nombre} className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="flex w-36 items-center gap-2">
                      <Switch
                        id={`horario-${i}`}
                        checked={d.abierto}
                        onCheckedChange={(v) => cambiar(i, { abierto: v })}
                        aria-label={`${nombre}: ${d.abierto ? "abierto" : "cerrado"}`}
                      />
                      <label htmlFor={`horario-${i}`} className="text-sm font-medium">
                        {nombre}
                      </label>
                    </div>
                    {d.abierto ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Input
                          type="time"
                          aria-label={`${nombre}: abre`}
                          value={d.abre}
                          onChange={(e) => cambiar(i, { abre: e.target.value })}
                          className="w-28"
                          aria-invalid={!!error}
                        />
                        <span className="text-muted-foreground">a</span>
                        <Input
                          type="time"
                          aria-label={`${nombre}: cierra`}
                          value={d.cierra}
                          onChange={(e) => cambiar(i, { cierra: e.target.value })}
                          className="w-28"
                          aria-invalid={!!error}
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Cerrado</span>
                    )}
                  </div>
                  {error && (
                    <p className="mt-1 text-xs text-destructive" role="alert">
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </fieldset>
          {resumen.length > 0 && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              <p className="text-muted-foreground">En el mapa se verá así:</p>
              <ul className="mt-1">
                {resumen.map((t) => (
                  <li key={t.dias}>
                    <span className="font-medium">{t.dias}:</span> {t.horas}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={guardando}>
              {guardando && <Loader2 className="animate-spin" />} Guardar horario
            </Button>
            <Button type="button" variant="outline" disabled={guardando} onClick={copiarLunes}>
              Copiar el horario del lunes a los días abiertos
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
