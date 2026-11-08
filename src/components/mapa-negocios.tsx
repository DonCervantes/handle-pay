// HND-050: mapa con MapLibre GL + teselas de OpenStreetMap.
// MapLibre toca window/document al importarse, así que se carga con import()
// dentro de un efecto: nunca corre en el servidor (SSR-safe). Mientras carga
// se ve un fondo neutro del mismo tamaño.
// La hoja de estilos de MapLibre la agrega la ruta en su head (maplibre-gl.css?url).
import { useEffect, useRef, useState } from "react";
import type { Map as MapaMapLibre, Marker, StyleSpecification } from "maplibre-gl";
import { CENTRO_POR_DEFECTO, limites, type NegocioPublico } from "@/lib/mapa";
import { cn } from "@/lib/utils";

type NegocioConPin = NegocioPublico & { ubicacion: { lat: number; lng: number } };

// Teselas raster estándar de OSM. Política de uso: atribución visible y tráfico
// moderado (https://operations.osmfoundation.org/policies/tiles/). Para producción
// con mucho tráfico conviene un proveedor de teselas propio.
const ESTILO_OSM: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export function MapaNegocios({
  negocios,
  seleccionado,
  onSeleccionar,
  zoomInicial = 12,
  className,
}: {
  negocios: readonly NegocioConPin[];
  seleccionado?: string | null;
  onSeleccionar?: (id: string) => void;
  zoomInicial?: number;
  className?: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaMapLibre | null>(null);
  const libreria = useRef<typeof import("maplibre-gl") | null>(null);
  const marcadores = useRef<Map<string, { marker: Marker; el: HTMLButtonElement }>>(new Map());
  const alSeleccionar = useRef(onSeleccionar);
  alSeleccionar.current = onSeleccionar;
  const ultimos = useRef(negocios);
  ultimos.current = negocios;
  // Los pines se rehacen solo si cambian de verdad (no por un arreglo nuevo con lo mismo).
  const clave = negocios
    .map((n) => `${n.id}:${n.ubicacion.lat},${n.ubicacion.lng}:${n.recomendado ? 1 : 0}`)
    .join("|");
  const [listo, setListo] = useState(false);
  const [falla, setFalla] = useState(false);

  // Crear el mapa una sola vez, solo en el navegador.
  useEffect(() => {
    let cancelado = false;
    const pines = marcadores.current;
    import("maplibre-gl")
      .then((mod) => {
        const maplibregl = (mod as unknown as { default?: typeof mod }).default ?? mod;
        if (cancelado || !contenedor.current) return;
        libreria.current = maplibregl;
        const m = new maplibregl.Map({
          container: contenedor.current,
          style: ESTILO_OSM,
          center: [CENTRO_POR_DEFECTO.lng, CENTRO_POR_DEFECTO.lat],
          zoom: zoomInicial,
          attributionControl: { compact: true },
          cooperativeGestures: false,
        });
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        m.addControl(
          new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: false } }),
          "top-right",
        );
        mapa.current = m;
        setListo(true);
      })
      .catch(() => setFalla(true));
    return () => {
      cancelado = true;
      pines.forEach(({ marker }) => marker.remove());
      pines.clear();
      mapa.current?.remove();
      mapa.current = null;
    };
    // zoomInicial solo aplica al crear el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pines: se reconstruyen cuando cambia la lista (p. ej. al filtrar).
  useEffect(() => {
    const m = mapa.current;
    const maplibregl = libreria.current;
    if (!listo || !m || !maplibregl) return;
    const negocios = ultimos.current;

    marcadores.current.forEach(({ marker }) => marker.remove());
    marcadores.current.clear();

    for (const n of negocios) {
      // Elemento propio (sin HTML interpolado): el nombre va como texto, no como markup.
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", n.recomendado ? `${n.nombre} (recomendado)` : n.nombre);
      el.title = n.nombre;
      el.className = claseDePin(n.recomendado);
      if (n.recomendado) el.dataset["recomendado"] = "1";
      el.textContent = n.recomendado ? "★" : "";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        alSeleccionar.current?.(n.id);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([n.ubicacion.lng, n.ubicacion.lat])
        .addTo(m);
      marcadores.current.set(n.id, { marker, el });
    }

    const caja = limites(negocios.map((n) => n.ubicacion));
    if (caja) m.fitBounds(caja, { padding: 56, maxZoom: 16, duration: 0 });
  }, [listo, clave]);

  // Resaltar el pin seleccionado y centrarlo.
  useEffect(() => {
    // classList y no className: MapLibre agrega sus propias clases de posición al elemento.
    marcadores.current.forEach(({ el }, id) => {
      const activo = id === seleccionado;
      for (const c of CLASES_ACTIVO) el.classList.toggle(c, activo);
      el.style.zIndex = activo ? "2" : el.dataset["recomendado"] ? "1" : "0";
    });
    const sel = seleccionado ? ultimos.current.find((n) => n.id === seleccionado) : undefined;
    if (sel && mapa.current) {
      mapa.current.easeTo({ center: [sel.ubicacion.lng, sel.ubicacion.lat], duration: 300 });
    }
  }, [seleccionado, clave, listo]);

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <div ref={contenedor} className="absolute inset-0" />
      {!listo && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {falla ? "No pudimos cargar el mapa. Revisa tu conexión." : "Cargando mapa…"}
        </div>
      )}
    </div>
  );
}

const CLASES_ACTIVO = ["scale-125", "ring-4", "ring-primary/40"];

function claseDePin(recomendado: boolean): string {
  return cn(
    "flex cursor-pointer items-center justify-center rounded-full border-2 border-white shadow-md",
    recomendado
      ? "size-8 bg-amber-500 text-sm font-bold leading-none text-white"
      : "size-5 bg-primary",
  );
}
