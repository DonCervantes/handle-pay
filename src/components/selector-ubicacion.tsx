// HND-115: mapa para colocar a mano el pin de un negocio. Se arrastra el pin o se
// hace clic donde va. Igual que MapaNegocios, MapLibre se carga con import() dentro
// de un efecto (nunca en SSR) y la ruta agrega maplibre-gl.css en su head.
import { useEffect, useRef, useState } from "react";
import type { Map as MapaMapLibre, Marker, StyleSpecification } from "maplibre-gl";
import { CENTRO_POR_DEFECTO } from "@/lib/mapa";
import type { Coordenada } from "@/lib/pin";
import { cn } from "@/lib/utils";

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

export function SelectorUbicacion({
  inicial,
  onCambio,
  className,
}: {
  /** Pin guardado, o null si el negocio aún no está ubicado (se centra en CDMX). */
  inicial: Coordenada | null;
  onCambio: (c: Coordenada) => void;
  className?: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaMapLibre | null>(null);
  const pin = useRef<Marker | null>(null);
  const alCambiar = useRef(onCambio);
  alCambiar.current = onCambio;
  const [listo, setListo] = useState(false);
  const [falla, setFalla] = useState(false);

  useEffect(() => {
    let cancelado = false;
    import("maplibre-gl")
      .then((mod) => {
        const maplibregl = (mod as unknown as { default?: typeof mod }).default ?? mod;
        if (cancelado || !contenedor.current) return;
        const centro = inicial ?? CENTRO_POR_DEFECTO;
        const m = new maplibregl.Map({
          container: contenedor.current,
          style: ESTILO_OSM,
          center: [centro.lng, centro.lat],
          zoom: inicial ? 17 : 11,
          attributionControl: { compact: true },
        });
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        const el = document.createElement("div");
        el.setAttribute("aria-label", "Pin del negocio (arrástralo)");
        el.dataset["pinEditable"] = "1";
        el.className = "size-6 cursor-grab rounded-full border-[3px] border-white bg-primary shadow-lg active:cursor-grabbing";
        const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: "center" })
          .setLngLat([centro.lng, centro.lat])
          .addTo(m);
        const avisar = () => {
          const p = marker.getLngLat();
          alCambiar.current({ lat: p.lat, lng: p.lng });
        };
        marker.on("dragend", avisar);
        m.on("click", (e) => {
          marker.setLngLat(e.lngLat);
          avisar();
        });
        mapa.current = m;
        pin.current = marker;
        setListo(true);
      })
      .catch(() => setFalla(true));
    return () => {
      cancelado = true;
      pin.current?.remove();
      pin.current = null;
      mapa.current?.remove();
      mapa.current = null;
    };
    // Solo al montar: el componente se vuelve a montar (key) para empezar de nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn("relative overflow-hidden rounded-md border bg-muted", className)}>
      {/* h-full y no absolute: maplibre-gl.css fuerza position: relative en .maplibregl-map. */}
      <div ref={contenedor} className="h-full w-full" data-testid="selector-ubicacion" />
      {!listo && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {falla ? "No pudimos cargar el mapa. Revisa tu conexión." : "Cargando mapa…"}
        </div>
      )}
    </div>
  );
}
