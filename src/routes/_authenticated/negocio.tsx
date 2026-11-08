import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Eye, FileUp, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { FormField, NativeSelect } from "@/components/form-bits";
import { meQuery } from "@/lib/session";
import { pageMeta } from "@/lib/metadata";
import { formatDate } from "@/lib/format";
import { CuentaCobro } from "@/components/cuenta-cobro";
import {
  ARCHIVOS_PERMITIDOS,
  CATEGORIAS,
  DOCUMENTOS,
  TAMANO_MAXIMO,
  erroresExpediente,
  expedienteEditable,
  faltantesParaEnviar,
  limpiarExpediente,
  type DatosExpediente,
  type ErroresExpediente,
  type TipoDocumento,
} from "@/lib/kyb";
import {
  abrirDocumento,
  datosDeNegocio,
  documentosQuery,
  miNegocioQuery,
  revisionesQuery,
  type DocumentoKyb,
  type Negocio,
} from "@/lib/negocio-data";

export const Route = createFileRoute("/_authenticated/negocio")({
  head: () =>
    pageMeta("Mi negocio", "Datos y documentos de tu negocio para la validación de la red Handle."),
  component: MiNegocio,
});

const mensaje = (e: unknown) =>
  e instanceof Error ? e.message : "Algo salió mal. Intenta de nuevo.";

function MiNegocio() {
  const { data: me } = useQuery(meQuery);
  const negocioQ = useQuery(miNegocioQuery);
  const negocio = negocioQ.data ?? null;
  const docsQ = useQuery({ ...documentosQuery(negocio?.id ?? ""), enabled: !!negocio });
  const revisionesQ = useQuery({ ...revisionesQuery(negocio?.id ?? ""), enabled: !!negocio });

  if (negocioQ.isPending || !me?.org_id) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando tu negocio…
      </p>
    );
  }
  if (negocioQ.error) {
    return (
      <p className="text-sm text-destructive">No pudimos cargar tu negocio. Recarga la página.</p>
    );
  }

  const editable = expedienteEditable(negocio?.estado_kyb);
  return (
    <>
      <PageHeader
        title="Mi negocio"
        description="Tus datos y documentos para que la red Handle valide tu negocio y puedas empezar a cobrar."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {negocio?.estado_kyb === "aprobado" && (
            <CuentaCobro titularSugerido={negocio.razon_social ?? negocio.nombre_comercial} />
          )}
          <DatosDelNegocio negocio={negocio} orgId={me.org_id} editable={editable} />
          <Documentos
            negocio={negocio}
            documentos={docsQ.data ?? []}
            orgId={me.org_id}
            editable={editable}
          />
        </div>
        <EstadoDelExpediente
          negocio={negocio}
          documentos={docsQ.data ?? []}
          ultimaRevision={revisionesQ.data?.[0] ?? null}
        />
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// Datos del negocio
// -----------------------------------------------------------------------------

const VACIO: DatosExpediente = {
  nombre_comercial: "",
  tipo_persona: "fisica",
  razon_social: "",
  rfc: "",
  curp: "",
  categoria: "abarrotes",
  telefono: "",
  direccion: "",
  cp: "",
};

function DatosDelNegocio({
  negocio,
  orgId,
  editable,
}: {
  negocio: Negocio | null;
  orgId: string;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const [datos, setDatos] = useState<DatosExpediente>(() =>
    negocio ? datosDeNegocio(negocio) : VACIO,
  );
  const [errores, setErrores] = useState<ErroresExpediente>({});
  const [guardando, setGuardando] = useState(false);

  // Si el negocio cambia en el servidor (p. ej. tras guardarlo), refleja lo guardado.
  useEffect(() => {
    if (negocio) setDatos(datosDeNegocio(negocio));
  }, [negocio]);

  const cambiar = <K extends keyof DatosExpediente>(campo: K, valor: DatosExpediente[K]) => {
    setDatos((d) => ({ ...d, [campo]: valor }));
    setErrores((e) => {
      const { [campo]: _quitado, ...resto } = e;
      return resto;
    });
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const encontrados = erroresExpediente(datos, { completo: false });
    setErrores(encontrados);
    if (Object.keys(encontrados).length) {
      toast.error("Revisa los campos marcados.");
      return;
    }
    const d = limpiarExpediente(datos);
    const fila = {
      nombre_comercial: d.nombre_comercial,
      tipo_persona: d.tipo_persona,
      razon_social: d.razon_social || null,
      rfc: d.rfc || null,
      curp: d.curp || null,
      categoria: d.categoria,
      telefono: d.telefono || null,
      direccion: d.direccion || null,
      cp: d.cp || null,
    };
    setGuardando(true);
    const { error } = negocio
      ? await supabase.from("businesses").update(fila).eq("id", negocio.id)
      : await supabase.from("businesses").insert({ ...fila, org_id: orgId });
    setGuardando(false);
    if (error) {
      toast.error(`No pudimos guardar: ${error.message}`);
      return;
    }
    toast.success("Datos guardados");
    await qc.invalidateQueries({ queryKey: ["mi-negocio"] });
  }

  const esFisica = datos.tipo_persona === "fisica";
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base">Datos del negocio</CardTitle>
        {!editable && (
          <p className="text-sm text-muted-foreground">
            Mientras tu expediente está en revisión o aprobado, tus datos fiscales no se pueden
            cambiar.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          <fieldset disabled={!editable || guardando} className="contents">
            <Campo
              etiqueta="Nombre del negocio"
              id="nombre_comercial"
              error={errores.nombre_comercial}
              ancho
            >
              <Input
                id="nombre_comercial"
                value={datos.nombre_comercial}
                onChange={(e) => cambiar("nombre_comercial", e.target.value)}
                placeholder="Abarrotes Doña Mari"
                maxLength={120}
              />
            </Campo>
            <Campo etiqueta="Giro" id="categoria">
              <NativeSelect
                id="categoria"
                value={datos.categoria}
                onChange={(e) =>
                  cambiar("categoria", e.target.value as DatosExpediente["categoria"])
                }
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </NativeSelect>
            </Campo>
            <Campo etiqueta="Tipo de persona ante el SAT" id="tipo_persona">
              <NativeSelect
                id="tipo_persona"
                value={datos.tipo_persona}
                onChange={(e) =>
                  cambiar("tipo_persona", e.target.value as DatosExpediente["tipo_persona"])
                }
              >
                <option value="fisica">Persona física (a mi nombre)</option>
                <option value="moral">Persona moral (empresa)</option>
              </NativeSelect>
            </Campo>
            <Campo
              etiqueta={esFisica ? "Tu nombre completo (como en tu RFC)" : "Razón social"}
              id="razon_social"
              error={errores.razon_social}
              ancho
            >
              <Input
                id="razon_social"
                value={datos.razon_social}
                onChange={(e) => cambiar("razon_social", e.target.value)}
                placeholder={esFisica ? "María López Martínez" : "Abarrotes Mari, S.A. de C.V."}
                maxLength={200}
              />
            </Campo>
            <Campo etiqueta="RFC" id="rfc" error={errores.rfc}>
              <Input
                id="rfc"
                value={datos.rfc}
                onChange={(e) => cambiar("rfc", e.target.value.toUpperCase())}
                placeholder={esFisica ? "13 caracteres" : "12 caracteres"}
                maxLength={16}
                autoCapitalize="characters"
                className="font-mono uppercase"
              />
            </Campo>
            {esFisica && (
              <Campo etiqueta="CURP" id="curp" error={errores.curp}>
                <Input
                  id="curp"
                  value={datos.curp}
                  onChange={(e) => cambiar("curp", e.target.value.toUpperCase())}
                  placeholder="18 caracteres"
                  maxLength={22}
                  autoCapitalize="characters"
                  className="font-mono uppercase"
                />
              </Campo>
            )}
            <Campo etiqueta="Teléfono del negocio" id="telefono" error={errores.telefono}>
              <Input
                id="telefono"
                type="tel"
                inputMode="numeric"
                value={datos.telefono}
                onChange={(e) => cambiar("telefono", e.target.value)}
                placeholder="55 1234 5678"
                maxLength={16}
              />
            </Campo>
            <Campo etiqueta="Dirección del negocio" id="direccion" error={errores.direccion} ancho>
              <Input
                id="direccion"
                value={datos.direccion}
                onChange={(e) => cambiar("direccion", e.target.value)}
                placeholder="Calle, número, colonia y alcaldía o municipio"
                maxLength={250}
              />
            </Campo>
            <Campo etiqueta="Código postal" id="cp" error={errores.cp}>
              <Input
                id="cp"
                inputMode="numeric"
                value={datos.cp}
                onChange={(e) => cambiar("cp", e.target.value)}
                placeholder="06000"
                maxLength={5}
              />
            </Campo>
          </fieldset>
          {editable && (
            <div className="flex items-end justify-end sm:col-span-2">
              <Button disabled={guardando}>
                {guardando && <Loader2 className="animate-spin" />}{" "}
                {negocio ? "Guardar cambios" : "Guardar"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function Campo({
  etiqueta,
  id,
  error,
  ancho = false,
  children,
}: {
  etiqueta: string;
  id: string;
  error?: string | undefined;
  ancho?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={ancho ? "sm:col-span-2" : undefined}>
      <FormField label={etiqueta} htmlFor={id}>
        {children}
      </FormField>
      {error && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Documentos
// -----------------------------------------------------------------------------

const EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function Documentos({
  negocio,
  documentos,
  orgId,
  editable,
}: {
  negocio: Negocio | null;
  documentos: DocumentoKyb[];
  orgId: string;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const [subiendo, setSubiendo] = useState<TipoDocumento | null>(null);

  async function subir(tipo: TipoDocumento, archivo: File) {
    if (!negocio) return;
    if (!ARCHIVOS_PERMITIDOS.includes(archivo.type)) {
      toast.error("Sube un PDF o una foto (JPG, PNG o WEBP).");
      return;
    }
    if (archivo.size > TAMANO_MAXIMO) {
      toast.error("El archivo pesa más de 10 MB. Intenta con una foto más ligera o un PDF.");
      return;
    }
    const anterior = documentos.find((d) => d.tipo === tipo);
    const ruta = `${orgId}/${tipo}-${Date.now()}.${EXTENSION[archivo.type]}`;
    setSubiendo(tipo);
    try {
      const subida = await supabase.storage
        .from("kyb")
        .upload(ruta, archivo, { contentType: archivo.type });
      if (subida.error) throw new Error(`No pudimos subir el archivo: ${subida.error.message}`);
      const { error } = await supabase
        .from("kyb_documents")
        .upsert(
          { business_id: negocio.id, org_id: orgId, tipo, storage_path: ruta },
          { onConflict: "business_id,tipo" },
        );
      if (error) {
        await supabase.storage.from("kyb").remove([ruta]);
        throw new Error(`No pudimos registrar el documento: ${error.message}`);
      }
      // El archivo reemplazado ya no se usa; si no se puede borrar no pasa nada.
      if (anterior) await supabase.storage.from("kyb").remove([anterior.storage_path]);
      toast.success("Documento subido");
      await qc.invalidateQueries({ queryKey: ["kyb-documentos", negocio.id] });
    } catch (e) {
      toast.error(mensaje(e));
    } finally {
      setSubiendo(null);
    }
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base">Documentos</CardTitle>
        <p className="text-sm text-muted-foreground">
          {negocio
            ? "PDF o foto legible, hasta 10 MB cada uno. Solo la red Handle puede verlos."
            : "Guarda primero los datos de tu negocio para poder subir documentos."}
        </p>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {DOCUMENTOS.map((doc) => (
          <FilaDocumento
            key={doc.tipo}
            etiqueta={doc.etiqueta}
            ayuda={doc.ayuda}
            documento={documentos.find((d) => d.tipo === doc.tipo) ?? null}
            puedeSubir={!!negocio && editable}
            subiendo={subiendo === doc.tipo}
            ocupado={subiendo !== null}
            onSubir={(archivo) => void subir(doc.tipo, archivo)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function FilaDocumento({
  etiqueta,
  ayuda,
  documento,
  puedeSubir,
  subiendo,
  ocupado,
  onSubir,
}: {
  etiqueta: string;
  ayuda: string;
  documento: DocumentoKyb | null;
  puedeSubir: boolean;
  subiendo: boolean;
  ocupado: boolean;
  onSubir: (archivo: File) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{etiqueta}</p>
          <StatusBadge status={documento?.estado ?? "falta"} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{ayuda}</p>
        {documento && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Subido el {formatDate(documento.updated_at)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        {documento && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              abrirDocumento(documento.storage_path).catch((e) => toast.error(mensaje(e)))
            }
          >
            <Eye /> Ver
          </Button>
        )}
        {puedeSubir && (
          <>
            <input
              ref={entrada}
              type="file"
              accept={ARCHIVOS_PERMITIDOS.join(",")}
              className="sr-only"
              aria-label={`Subir ${etiqueta}`}
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                e.target.value = "";
                if (archivo) onSubir(archivo);
              }}
            />
            <Button
              type="button"
              variant={documento ? "outline" : "default"}
              size="sm"
              disabled={ocupado}
              onClick={() => entrada.current?.click()}
            >
              {subiendo ? <Loader2 className="animate-spin" /> : <FileUp />}
              {documento ? "Reemplazar" : "Subir"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Estado del expediente y envío a revisión
// -----------------------------------------------------------------------------

function EstadoDelExpediente({
  negocio,
  documentos,
  ultimaRevision,
}: {
  negocio: Negocio | null;
  documentos: DocumentoKyb[];
  ultimaRevision: { decision: string; notas: string | null; created_at: string } | null;
}) {
  const qc = useQueryClient();
  const [enviando, setEnviando] = useState(false);
  const estado = negocio?.estado_kyb ?? "borrador";
  const faltan = faltantesParaEnviar(
    negocio ? datosDeNegocio(negocio) : null,
    documentos.map((d) => d.tipo),
  );

  async function enviar() {
    if (!negocio) return;
    setEnviando(true);
    const { error } = await supabase
      .from("businesses")
      .update({ estado_kyb: "en_revision" })
      .eq("id", negocio.id);
    setEnviando(false);
    if (error) {
      toast.error(`No pudimos enviar tu expediente: ${error.message}`);
      return;
    }
    toast.success("Expediente enviado a revisión");
    await qc.invalidateQueries({ queryKey: ["mi-negocio"] });
  }

  return (
    <Card className="shadow-card lg:sticky lg:top-24">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Estado del expediente</CardTitle>
          <StatusBadge status={estado} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {estado === "en_revision" && (
          <p className="text-muted-foreground">
            La red Handle está revisando tu expediente. Vuelve a esta página para ver el resultado.
          </p>
        )}
        {estado === "aprobado" && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="size-4" /> Tu negocio está aprobado
            </p>
            <p className="text-muted-foreground">
              El siguiente paso es conectar tu cuenta de cobro CoDi para empezar a cobrar
              (próximamente).
            </p>
          </div>
        )}
        {estado === "rechazado" && ultimaRevision?.notas && (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive"
            role="alert"
          >
            <p className="font-medium">Necesitamos que corrijas algo:</p>
            <p className="mt-1">{ultimaRevision.notas}</p>
          </div>
        )}

        {expedienteEditable(estado) && (
          <>
            {faltan.length > 0 ? (
              <div>
                <p className="font-medium">Para enviarlo a revisión falta:</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {faltan.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden>•</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Todo listo. Envíalo para que la red Handle lo revise.
              </p>
            )}
            <Button
              className="w-full"
              disabled={faltan.length > 0 || enviando}
              onClick={() => void enviar()}
            >
              {enviando ? <Loader2 className="animate-spin" /> : <Send />}
              {estado === "rechazado" ? "Volver a enviar a revisión" : "Enviar a revisión"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
