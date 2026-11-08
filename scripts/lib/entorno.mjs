// Utilidades compartidas por los scripts de producción (HND-062).
// Leen un archivo tipo .env SIN tocar process.env y nunca imprimen valores.
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/** Lee un archivo .env y devuelve un objeto { NOMBRE: valor }. Falla con mensaje claro si no existe. */
export function leerArchivoEnv(ruta) {
  if (!existsSync(ruta)) {
    throw new Error(
      `No existe ${ruta}. Copia .env.production.example a .env.production y rellénalo.`,
    );
  }
  return parseEnv(readFileSync(ruta, "utf8"));
}

/** Banderas simples: --aplicar, --env <ruta>, --ayuda. */
export function leerBanderas(argv = process.argv.slice(2)) {
  const banderas = { aplicar: false, ayuda: false, env: ".env.production", resto: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--aplicar") banderas.aplicar = true;
    else if (a === "--ayuda" || a === "-h" || a === "--help") banderas.ayuda = true;
    else if (a === "--env") banderas.env = argv[++i];
    else if (a.startsWith("--env=")) banderas.env = a.slice(6);
    else banderas.resto.push(a);
  }
  return banderas;
}

/** Descripción de un valor sin revelarlo. */
export function describir(valor) {
  if (valor === undefined) return "falta";
  if (valor.trim() === "") return "vacía";
  return "definida";
}

/** Oculta un valor dentro de un texto (por si un error de una API lo repite). */
export function ocultar(texto, secretos) {
  let salida = String(texto);
  for (const s of secretos) if (s && s.length >= 4) salida = salida.split(s).join("••••");
  return salida;
}
