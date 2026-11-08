// HND-052: perfil público de un negocio afiliado (se llega desde el pin o la lista del mapa).
// Solo muestra lo que expone negocios_publicos(): nada fiscal, bancario ni de contacto privado.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ArrowLeft, Clock, Gift, Loader2, MapPin, Navigation, QrCode, Star } from "lucide-react";
import maplibreCss from "maplibre-gl/dist/maplibre-gl.css?url";
import { EncabezadoPublico } from "@/components/encabezado-publico";
import { MapaNegocios } from "@/components/mapa-negocios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { conUbicacion, enlaceComoLlegar, etiquetaCategoria } from "@/lib/mapa";
import { negocioPublicoQuery } from "@/lib/mapa-data";
import { pageMeta } from "@/lib/metadata";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/mapa/$id")({
  head: () => ({
    ...pageMeta(
      "Negocio afiliado",
      "Perfil de un changarro de la red Handle: ubicación, horario y promociones.",
    ),
    links: [{ rel: "stylesheet", href: maplibreCss }],
  }),
  component: PerfilNegocio,
});

function PerfilNegocio() {
  const { id } = Route.useParams();
  const idValido = UUID.test(id);
  const q = useQuery({ ...negocioPublicoQuery(id), enabled: idValido });
  const n = q.data;

  const volver = (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/mapa">
        <ArrowLeft /> Volver al mapa
      </Link>
    </Button>
  );

  let contenido;
  if (idValido && q.isPending) {
    contenido = (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando negocio…
      </p>
    );
  } else if (q.error) {
    contenido = (
      <div className="rounded-lg border p-4 text-sm">
        <p>No pudimos cargar este negocio.</p>
        <Button className="mt-2" size="sm" variant="outline" onClick={() => q.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  } else if (!n) {
    contenido = (
      <div className="rounded-lg border p-6 text-center">
        <p className="font-medium">Este negocio no está en el mapa</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Puede que el enlace esté mal o que el negocio ya no esté afiliado a Handle.
        </p>
      </div>
    );
  } else {
    const pin = conUbicacion([n]);
    contenido = (
      <article className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">{etiquetaCategoria(n.categoria)}</p>
            <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
              {n.nombre}
            </h1>
            {n.recomendado && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                <Star className="size-4 fill-current" /> Recomendado por la red Handle
              </p>
            )}
          </div>

          <Card className="shadow-card">
            <CardContent className="divide-y p-0">
              <Dato icono={<MapPin />} titulo="Ubicación">
                {n.direccion ?? "Dirección no disponible"}
                {n.ubicacion && (
                  <a
                    href={enlaceComoLlegar(n.ubicacion)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 flex items-center gap-1 text-sm font-medium text-gold hover:underline"
                  >
                    <Navigation className="size-3.5" /> Cómo llegar
                  </a>
                )}
              </Dato>
              <Dato icono={<Clock />} titulo="Horario">
                {n.horario.length === 0 ? (
                  "El negocio aún no publica su horario."
                ) : (
                  <ul className="space-y-0.5">
                    {n.horario.map((h, i) => (
                      <li key={i}>
                        {h.dias && (
                          <span className="inline-block first-letter:uppercase">
                            {h.dias}:&nbsp;
                          </span>
                        )}
                        {h.horas}
                      </li>
                    ))}
                  </ul>
                )}
              </Dato>
              <Dato icono={<Gift />} titulo="Promociones">
                {n.puntosPorcentaje
                  ? `Gana ${n.puntosPorcentaje} puntos por cada $100 que pagues. Cada punto vale $1 de descuento en tu siguiente compra aquí.`
                  : "Por ahora no tiene programa de puntos."}
              </Dato>
              <Dato icono={<QrCode />} titulo="Cómo pagar">
                Con CoDi: escanea el QR en caja con la app de tu banco. Si das tu correo, juntas
                puntos.
              </Dato>
            </CardContent>
          </Card>
        </div>

        {pin.length > 0 ? (
          <MapaNegocios
            negocios={pin}
            seleccionado={n.id}
            zoomInicial={16}
            className="h-72 rounded-xl border lg:h-[420px]"
          />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-xl border bg-muted text-sm text-muted-foreground">
            Estamos ubicando este negocio en el mapa.
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <EncabezadoPublico />
      <main className="mx-auto max-w-6xl space-y-4 px-4 pb-10 pt-4">
        {volver}
        {contenido}
      </main>
    </div>
  );
}

function Dato({
  icono,
  titulo,
  children,
}: {
  icono: ReactNode;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 px-4 py-3 sm:px-6">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icono}</span>
      <div className="min-w-0 text-sm">
        <p className="font-medium">{titulo}</p>
        <div className="mt-0.5 break-words text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
