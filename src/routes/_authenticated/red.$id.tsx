import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Check, ExternalLink, Eye, Loader2, Star, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/status-badge";
import { CATEGORIAS, DOCUMENTOS } from "@/lib/kyb";
import { abrirDocumento, documentosQuery } from "@/lib/negocio-data";
import { revisarExpediente } from "@/lib/kyb.functions";
import { marcarRecomendado } from "@/lib/mapa.functions";
import { formatDate } from "@/lib/format";
import { pageMeta } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/red/$id")({
  head: () => pageMeta("Revisar expediente", "Revisión del expediente KYB de un negocio."),
  component: RevisarExpediente,
});

const mensaje = (e: unknown) =>
  e instanceof Error ? e.message : "Algo salió mal. Intenta de nuevo.";

function RevisarExpediente() {
  const { id } = Route.useParams();
  const negocioQ = useQuery({
    queryKey: ["red-negocio", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const docsQ = useQuery(documentosQuery(id));
  const revisionesQ = useQuery({
    queryKey: ["kyb-revisiones-red", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kyb_reviews")
        .select("id, decision, notas, created_at, profiles(full_name)")
        .eq("business_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const volver = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
      <Link to="/red" search={{ estado: "en_revision" }}>
        <ArrowLeft /> Volver a la red
      </Link>
    </Button>
  );

  if (negocioQ.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando expediente…
      </p>
    );
  }
  const n = negocioQ.data;
  if (negocioQ.error || !n) {
    return (
      <>
        {volver}
        <p className="text-sm text-muted-foreground">No encontramos este negocio.</p>
      </>
    );
  }

  const fila = (etiqueta: string, valor: string | null | undefined, mono = false) => (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 px-6 py-3 text-sm">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className={mono ? "break-all font-mono" : "break-words"}>{valor || "—"}</span>
    </div>
  );

  return (
    <>
      {volver}
      <PageHeader
        title={n.nombre_comercial}
        description={`${CATEGORIAS.find((c) => c.valor === n.categoria)?.etiqueta ?? n.categoria} · actualizado el ${formatDate(n.updated_at)}`}
        actions={<StatusBadge status={n.estado_kyb} />}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Datos fiscales y de contacto</CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {fila(
                "Tipo de persona",
                n.tipo_persona === "fisica" ? "Persona física" : "Persona moral",
              )}
              {fila(n.tipo_persona === "fisica" ? "Nombre" : "Razón social", n.razon_social)}
              {fila("RFC", n.rfc, true)}
              {n.tipo_persona === "fisica" && fila("CURP", n.curp, true)}
              {fila("Teléfono", n.telefono)}
              {fila("Dirección", n.direccion)}
              {fila("Código postal", n.cp)}
              <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 px-6 py-3 text-sm">
                <span className="text-muted-foreground">Ubicación</span>
                {n.lat != null && n.lng != null ? (
                  <a
                    className="inline-flex items-center gap-1 text-gold hover:underline"
                    href={`https://www.openstreetmap.org/?mlat=${n.lat}&mlon=${n.lng}#map=18/${n.lat}/${n.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {n.lat}, {n.lng} <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span>{n.estado_kyb === "aprobado" ? "Sin ubicar" : "Se ubica al aprobar"}</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Documentos</CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {DOCUMENTOS.map((doc) => {
                const d = docsQ.data?.find((x) => x.tipo === doc.tipo);
                return (
                  <div key={doc.tipo} className="flex items-center gap-3 px-6 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{doc.etiqueta}</p>
                      {d && (
                        <p className="text-xs text-muted-foreground">
                          Subido el {formatDate(d.updated_at)}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={d?.estado ?? "falta"} />
                    {d && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          abrirDocumento(d.storage_path).catch((e) => toast.error(mensaje(e)))
                        }
                      >
                        <Eye /> Ver
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-24">
          {n.estado_kyb === "en_revision" && <PanelDeDecision businessId={n.id} />}
          {n.estado_kyb === "aprobado" && (
            <PanelRecomendado businessId={n.id} recomendado={n.recomendado} activo={n.activo} />
          )}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Historial de revisiones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(revisionesQ.data ?? []).length === 0 && (
                <p className="text-muted-foreground">Aún no se ha revisado.</p>
              )}
              {(revisionesQ.data ?? []).map((r) => (
                <div key={r.id} className="rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={r.decision} />
                    <span className="text-xs text-muted-foreground">
                      {formatDate(r.created_at)}
                    </span>
                  </div>
                  {r.notas && <p className="mt-2">{r.notas}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Por {r.profiles?.full_name ?? "la red Handle"}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function PanelDeDecision({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const revisarFn = useServerFn(revisarExpediente);
  const [notas, setNotas] = useState("");
  const [enCurso, setEnCurso] = useState<"aprobado" | "rechazado" | null>(null);
  const [errorNotas, setErrorNotas] = useState<string | null>(null);

  async function decidir(decision: "aprobado" | "rechazado") {
    if (decision === "rechazado" && !notas.trim()) {
      setErrorNotas("Explica qué debe corregir el negocio para poder rechazar.");
      return;
    }
    setEnCurso(decision);
    try {
      const { ubicacion } = await revisarFn({
        data: { businessId, decision, ...(notas.trim() ? { notas: notas.trim() } : {}) },
      });
      if (decision === "rechazado")
        toast.success("Expediente rechazado; el negocio verá el motivo.");
      else if (!ubicacion) toast.warning("Negocio aprobado, pero no pudimos ubicarlo en el mapa.");
      else if (ubicacion.precision === "codigo_postal")
        toast.success("Negocio aprobado y ubicado de forma aproximada (por código postal).");
      else toast.success("Negocio aprobado y ubicado en el mapa.");
      setNotas("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["red-negocio", businessId] }),
        qc.invalidateQueries({ queryKey: ["kyb-documentos", businessId] }),
        qc.invalidateQueries({ queryKey: ["kyb-revisiones-red", businessId] }),
        qc.invalidateQueries({ queryKey: ["red-negocios"] }),
      ]);
    } catch (e) {
      toast.error(mensaje(e));
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <Card className="border-primary/40 shadow-card">
      <CardHeader>
        <CardTitle className="text-base">Tu decisión</CardTitle>
        <p className="text-sm text-muted-foreground">
          Revisa que los datos coincidan con los documentos y que la cuenta bancaria esté a nombre
          del titular.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="notas">Notas para el negocio</Label>
          <Textarea
            id="notas"
            value={notas}
            onChange={(e) => {
              setNotas(e.target.value);
              setErrorNotas(null);
            }}
            maxLength={1000}
            rows={4}
            placeholder="Obligatorias para rechazar. Ej.: la INE está borrosa, súbela de nuevo."
          />
          {errorNotas && (
            <p className="text-xs text-destructive" role="alert">
              {errorNotas}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={enCurso !== null}
            onClick={() => void decidir("rechazado")}
          >
            {enCurso === "rechazado" ? <Loader2 className="animate-spin" /> : <X />} Rechazar
          </Button>
          <Button disabled={enCurso !== null} onClick={() => void decidir("aprobado")}>
            {enCurso === "aprobado" ? <Loader2 className="animate-spin" /> : <Check />} Aprobar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** HND-053: destacar el negocio en el mapa público. */
function PanelRecomendado({
  businessId,
  recomendado,
  activo,
}: {
  businessId: string;
  recomendado: boolean;
  activo: boolean;
}) {
  const qc = useQueryClient();
  const marcarFn = useServerFn(marcarRecomendado);
  const [guardando, setGuardando] = useState(false);

  async function cambiar(valor: boolean) {
    setGuardando(true);
    try {
      await marcarFn({ data: { businessId, recomendado: valor } });
      toast.success(
        valor ? "Negocio recomendado: se destaca en el mapa." : "Ya no aparece como recomendado.",
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["red-negocio", businessId] }),
        qc.invalidateQueries({ queryKey: ["red-negocios"] }),
        qc.invalidateQueries({ queryKey: ["negocios-publicos"] }),
        qc.invalidateQueries({ queryKey: ["negocio-publico", businessId] }),
      ]);
    } catch (e) {
      toast.error(mensaje(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="size-4 text-amber-500" /> Mapa público
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Los negocios recomendados se destacan con una estrella en el mapa.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="recomendado">Negocio recomendado</Label>
          <Switch
            id="recomendado"
            checked={recomendado}
            disabled={guardando}
            onCheckedChange={(v) => void cambiar(v)}
          />
        </div>
        {!activo && (
          <p className="text-xs text-muted-foreground">
            Este negocio está inactivo: no aparece en el mapa aunque esté recomendado.
          </p>
        )}
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link to="/mapa/$id" params={{ id: businessId }} target="_blank">
            <ExternalLink /> Ver perfil público
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
