// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

// HND-005: MapLibre solo corre en el navegador (import() dentro de un efecto), pero el
// build de servidor lo empaquetaba igual (~1.4 MB). Fuera del cliente se resuelve a un
// módulo vacío para que no pese en el Worker. La hoja de estilos (?url) no se toca.
const STUB_MAPLIBRE = "\0handle:mapa-solo-navegador";
function maplibreSoloEnCliente(): Plugin {
  return {
    name: "handle:maplibre-solo-en-cliente",
    enforce: "pre",
    applyToEnvironment: (env) => env.name !== "client",
    resolveId(id) {
      return id === "maplibre-gl" ? STUB_MAPLIBRE : null;
    },
    load(id) {
      return id === STUB_MAPLIBRE ? "export default {};" : null;
    },
  };
}

export default defineConfig({
  plugins: [maplibreSoloEnCliente()],
  // HND-005: el despliegue es en Cloudflare Workers. Se fija el preset para que la
  // detección automática de otra plataforma no cambie el destino del build.
  // Nombre del Worker y fecha de compatibilidad: wrangler.jsonc.
  nitro: {
    preset: "cloudflare-module",
    cloudflare: { nodeCompat: true, deployConfig: true },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
