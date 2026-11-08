import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/form-bits";
import { erroresRegla, formatPuntos, maximoCanje, puntosGanados } from "@/lib/puntos";

type Campos = {
  porcentaje: string;
  tope_puntos: string;
  vigencia_dias: string;
  canje_max_porcentaje: string;
  activo: boolean;
};
type Errores = Partial<Record<Exclude<keyof Campos, "activo">, string>>;

const NUEVO: Campos = {
  porcentaje: "5",
  tope_puntos: "",
  vigencia_dias: "180",
  canje_max_porcentaje: "50",
  activo: true,
};

/** "" → null; texto no numérico → NaN (erroresRegla lo marca). */
const numero = (t: string) => (t.trim() ? Number(t.replace(/[,\s]/g, "")) : null);

/** Regla de puntos del negocio: la activa o, si no hay, la más reciente (RLS: su org). */
function reglaQuery(businessId: string) {
  return {
    queryKey: ["regla-puntos", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("point_rules")
        .select("id, porcentaje, tope_puntos, vigencia_dias, canje_max_porcentaje, activo")
        .eq("business_id", businessId)
        .order("activo", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  };
}

/**
 * HND-040: el dueño o un administrador define cómo gana y usa puntos su clientela.
 * Escribe directo en point_rules con el cliente del navegador (RLS: owner/admin de su org).
 */
export function ProgramaPuntos({ businessId, orgId }: { businessId: string; orgId: string }) {
  const qc = useQueryClient();
  const q = useQuery(reglaQuery(businessId));
  const regla = q.data ?? null;
  const [campos, setCampos] = useState<Campos>(NUEVO);
  const [errores, setErrores] = useState<Errores>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!regla) return;
    setCampos({
      porcentaje: String(Number(regla.porcentaje)),
      tope_puntos: regla.tope_puntos == null ? "" : String(Number(regla.tope_puntos)),
      vigencia_dias: regla.vigencia_dias == null ? "" : String(regla.vigencia_dias),
      canje_max_porcentaje: String(Number(regla.canje_max_porcentaje)),
      activo: regla.activo,
    });
  }, [regla]);

  const cambiar = <K extends keyof Campos>(campo: K, valor: Campos[K]) => {
    setCampos((c) => ({ ...c, [campo]: valor }));
    setErrores((e) => {
      const { [campo as keyof Errores]: _quitado, ...resto } = e;
      return resto;
    });
  };

  const valores = {
    porcentaje: numero(campos.porcentaje),
    tope_puntos: numero(campos.tope_puntos),
    vigencia_dias: numero(campos.vigencia_dias),
    canje_max_porcentaje: numero(campos.canje_max_porcentaje),
  };
  const sinErrores = Object.keys(erroresRegla(valores)).length === 0;
  const ejemplo =
    sinErrores && valores.porcentaje != null && valores.canje_max_porcentaje != null
      ? {
          porcentaje: valores.porcentaje,
          tope_puntos: valores.tope_puntos,
          vigencia_dias: valores.vigencia_dias,
          canje_max_porcentaje: valores.canje_max_porcentaje,
          activo: true,
        }
      : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const encontrados = erroresRegla(valores);
    setErrores(encontrados);
    if (Object.keys(encontrados).length) {
      toast.error("Revisa los campos marcados.");
      return;
    }
    setGuardando(true);
    const fila = {
      porcentaje: valores.porcentaje!,
      tope_puntos: valores.tope_puntos,
      vigencia_dias: valores.vigencia_dias,
      canje_max_porcentaje: valores.canje_max_porcentaje!,
      activo: campos.activo,
    };
    const { error } = regla
      ? await supabase.from("point_rules").update(fila).eq("id", regla.id)
      : await supabase
          .from("point_rules")
          .insert({ ...fila, business_id: businessId, org_id: orgId });
    setGuardando(false);
    if (error) {
      console.error("point_rules", error);
      toast.error("No pudimos guardar el programa de puntos. Intenta de nuevo.");
      return;
    }
    toast.success(campos.activo ? "Programa de puntos guardado" : "Programa de puntos pausado");
    await qc.invalidateQueries({ queryKey: ["regla-puntos", businessId] });
  }

  if (q.isPending) return null;
  if (q.error) {
    return (
      <p className="text-sm text-destructive">
        No pudimos cargar tu programa de puntos. Recarga la página.
      </p>
    );
  }

  const campo = (
    id: Exclude<keyof Campos, "activo">,
    label: string,
    ayuda: string,
    placeholder?: string,
  ) => (
    <div>
      <FormField label={label} htmlFor={`regla-${id}`}>
        <Input
          id={`regla-${id}`}
          inputMode="decimal"
          value={campos[id]}
          onChange={(e) => cambiar(id, e.target.value)}
          placeholder={placeholder}
          aria-invalid={!!errores[id]}
        />
      </FormField>
      <p
        className={`mt-1 text-xs ${errores[id] ? "text-destructive" : "text-muted-foreground"}`}
        role={errores[id] ? "alert" : undefined}
      >
        {errores[id] ?? ayuda}
      </p>
    </div>
  );

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="size-4" /> Programa de puntos
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Tus clientes ganan puntos en cada compra y los usan como descuento solo en tu negocio. 1
          punto = $1 de descuento. Los puntos no son dinero: no se retiran ni se transfieren.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          {campo(
            "porcentaje",
            "Puntos por cada $100 (%)",
            "Ej.: 5 = 5 puntos por cada $100 pagados.",
          )}
          {campo(
            "tope_puntos",
            "Tope de puntos por compra",
            "Opcional. Déjalo vacío para no poner tope.",
            "Sin tope",
          )}
          {campo(
            "vigencia_dias",
            "Vencen tras días sin comprar",
            "Opcional. Si el cliente no vuelve en esos días, sus puntos vencen.",
            "No vencen",
          )}
          {campo(
            "canje_max_porcentaje",
            "Máximo a pagar con puntos (%)",
            "De 1 a 90. Siempre queda algo que pagar por CoDi.",
          )}
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              id="regla-activo"
              checked={campos.activo}
              onCheckedChange={(v) => cambiar("activo", v)}
            />
            <Label htmlFor="regla-activo">
              {campos.activo ? "Programa activo" : "Programa pausado"}
            </Label>
          </div>
          {ejemplo && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground sm:col-span-2">
              Ejemplo: en una compra de $200, un cliente nuevo gana{" "}
              <span className="font-medium text-foreground">
                {formatPuntos(puntosGanados(200, ejemplo, "nuevo"))} puntos
              </span>{" "}
              y, si tiene saldo, puede usar hasta{" "}
              <span className="font-medium text-foreground">
                {formatPuntos(maximoCanje(200, ejemplo, Infinity))} puntos
              </span>
              . Los clientes frecuentes ganan hasta 50% más.
            </p>
          )}
          <div className="sm:col-span-2">
            <Button disabled={guardando}>
              {guardando && <Loader2 className="animate-spin" />}{" "}
              {regla ? "Guardar cambios" : "Crear programa"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
