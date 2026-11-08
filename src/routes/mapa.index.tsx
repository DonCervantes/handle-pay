// HND-050 + HND-051: mapa público de changarros afiliados con filtro por categoría.
// Página pública (sin sesión). Los filtros viven en la URL (?categoria=&recomendados=)
// para poder compartir el enlace y regresar sin perderlos.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Gift, MapPin, Star, X } from "lucide-react";
import maplibreCss from "maplibre-gl/dist/maplibre-gl.css?url";
import { EncabezadoPublico } from "@/components/encabezado-publico";
import { MapaNegocios } from "@/components/mapa-negocios";
import { Button } from "@/components/ui/button";
import { CATEGORIAS } from "@/lib/kyb";
import {
  busquedaMapa,
  conteoPorCategoria,
  conUbicacion,
  etiquetaCategoria,
  filtrarNegocios,
  type NegocioPublico,
} from "@/lib/mapa";
import { negociosPublicosQuery } from "@/lib/mapa-data";
import { pageMeta } from "@/lib/metadata";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mapa/")({
  validateSearch: (s) => busquedaMapa.parse(s),
  head: () => ({
    ...pageMeta(
      "Mapa de changarros",
      "Encuentra tiendas, taquerías, carnicerías y más changarros cerca de ti que aceptan CoDi y dan puntos con Handle.",
    ),
    links: [{ rel: "stylesheet", href: maplibreCss }],
  }),
  component: MapaPublico,
});

function MapaPublico() {
  const filtros = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const q = useQuery(negociosPublicosQuery);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const todos = q.data ?? [];
  const visibles = useMemo(() => filtrarNegocios(q.data ?? [], filtros), [q.data, filtros]);
  const pines = useMemo(() => conUbicacion(visibles), [visibles]);
  const conteo = useMemo(() => conteoPorCategoria(q.data ?? []), [q.data]);
  const categoriasConNegocios = CATEGORIAS.filter((c) => (conteo[c.valor] ?? 0) > 0);
  const elegido = visibles.find((n) => n.id === seleccionado) ?? null;

  const cambiarFiltros = (cambios: Partial<typeof filtros>) => {
    setSeleccionado(null);
    void navigate({ search: (prev) => ({ ...prev, ...cambios }), replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <EncabezadoPublico />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 pt-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Changarros Handle cerca de ti
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paga con CoDi desde tu celular y junta puntos para tu próxima compra.
        </p>

        {/* HND-051: filtro por categoría */}
        <div
          className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1"
          role="toolbar"
          aria-label="Filtrar por tipo de negocio"
        >
          <Chip
            activo={!filtros.categoria}
            onClick={() => cambiarFiltros({ categoria: undefined })}
          >
            Todos <Cuenta n={todos.length} />
          </Chip>
          {categoriasConNegocios.map((c) => (
            <Chip
              key={c.valor}
              activo={filtros.categoria === c.valor}
              onClick={() =>
                cambiarFiltros({
                  categoria: filtros.categoria === c.valor ? undefined : c.valor,
                })
              }
            >
              {c.etiqueta} <Cuenta n={conteo[c.valor] ?? 0} />
            </Chip>
          ))}
          <Chip
            activo={!!filtros.recomendados}
            onClick={() =>
              cambiarFiltros({ recomendados: filtros.recomendados ? undefined : true })
            }
          >
            <Star className="size-3.5" /> Recomendados
          </Chip>
        </div>

        <div className="mt-4 grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="relative">
            <MapaNegocios
              negocios={pines}
              seleccionado={seleccionado}
              onSeleccionar={setSeleccionado}
              className="h-[55vh] min-h-[320px] rounded-xl border lg:h-[calc(100vh-14rem)]"
            />
            {elegido && <TarjetaSeleccion negocio={elegido} cerrar={() => setSeleccionado(null)} />}
          </div>

          <section aria-label="Lista de negocios" className="min-w-0">
            <p className="mb-2 text-sm text-muted-foreground" aria-live="polite">
              {q.isPending
                ? "Buscando changarros…"
                : q.error
                  ? ""
                  : `${visibles.length} ${visibles.length === 1 ? "negocio" : "negocios"}`}
            </p>
            {q.error && (
              <div className="rounded-lg border p-4 text-sm">
                <p>No pudimos cargar los negocios.</p>
                <Button className="mt-2" size="sm" variant="outline" onClick={() => q.refetch()}>
                  Reintentar
                </Button>
              </div>
            )}
            {!q.isPending && !q.error && visibles.length === 0 && (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                {todos.length === 0
                  ? "Todavía no hay changarros en el mapa. ¡Pronto habrá más!"
                  : "No hay negocios con ese filtro."}
                {(filtros.categoria || filtros.recomendados) && (
                  <Button
                    className="mt-2 block"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      cambiarFiltros({ categoria: undefined, recomendados: undefined })
                    }
                  >
                    Quitar filtros
                  </Button>
                )}
              </div>
            )}
            <ul className="space-y-2 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto lg:pr-1">
              {visibles.map((n) => (
                <li key={n.id}>
                  <FilaNegocio
                    negocio={n}
                    activo={n.id === seleccionado}
                    alUbicar={n.ubicacion ? () => setSeleccionado(n.id) : undefined}
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={activo ? "default" : "outline"}
      aria-pressed={activo}
      onClick={onClick}
      className="shrink-0 rounded-full"
    >
      {children}
    </Button>
  );
}

function Cuenta({ n }: { n: number }) {
  return <span className="rounded-full bg-black/10 px-1.5 text-xs dark:bg-white/15">{n}</span>;
}

function InsigniaRecomendado() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
      <Star className="size-3 fill-current" /> Recomendado
    </span>
  );
}

function FilaNegocio({
  negocio: n,
  activo,
  alUbicar,
}: {
  negocio: NegocioPublico;
  activo: boolean;
  alUbicar?: (() => void) | undefined;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-3",
        n.recomendado && "border-amber-400/70",
        activo && "ring-2 ring-primary/40",
      )}
    >
      <button
        type="button"
        className="min-w-0 flex-1 text-left disabled:cursor-default"
        onClick={alUbicar}
        disabled={!alUbicar}
        aria-label={alUbicar ? `Ver ${n.nombre} en el mapa` : undefined}
      >
        <p className="truncate font-medium">{n.nombre}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{etiquetaCategoria(n.categoria)}</span>
          {n.recomendado && <InsigniaRecomendado />}
          {!n.ubicacion && <span>Ubicación pendiente</span>}
        </p>
      </button>
      <Button asChild size="sm" variant="ghost" aria-label={`Ver perfil de ${n.nombre}`}>
        <Link to="/mapa/$id" params={{ id: n.id }}>
          Ver <ChevronRight />
        </Link>
      </Button>
    </div>
  );
}

/** HND-052: desde el pin se llega al perfil del negocio. */
function TarjetaSeleccion({ negocio: n, cerrar }: { negocio: NegocioPublico; cerrar: () => void }) {
  return (
    <div className="absolute inset-x-2 bottom-2 z-10 rounded-xl border bg-card p-4 shadow-lg sm:inset-x-auto sm:left-3 sm:w-80">
      <button
        type="button"
        onClick={cerrar}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted"
        aria-label="Cerrar"
      >
        <X className="size-4" />
      </button>
      <p className="pr-6 font-semibold">{n.nombre}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {etiquetaCategoria(n.categoria)}
        {n.recomendado && <InsigniaRecomendado />}
      </p>
      {n.direccion && (
        <p className="mt-2 flex gap-1.5 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="line-clamp-2">{n.direccion}</span>
        </p>
      )}
      {n.puntosPorcentaje && (
        <p className="mt-1 flex gap-1.5 text-sm">
          <Gift className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          Gana {n.puntosPorcentaje} puntos por cada $100
        </p>
      )}
      <Button asChild className="mt-3 w-full" size="sm">
        <Link to="/mapa/$id" params={{ id: n.id }}>
          Ver perfil del negocio
        </Link>
      </Button>
    </div>
  );
}
