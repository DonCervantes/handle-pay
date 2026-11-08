// HND-061: aviso de privacidad (LFPDPPP) y términos de uso.
// Las versiones se guardan junto con la aceptación de cada persona al registrarse
// (tabla legal_acceptances, la llena un trigger en auth.users). Si cambias el texto
// de /privacidad o /terminos de forma relevante, sube la versión aquí.

/** Versión vigente del aviso de privacidad (fecha de publicación, AAAA-MM-DD). */
export const VERSION_PRIVACIDAD = "2026-11-07";
/** Versión vigente de los términos de uso (fecha de publicación, AAAA-MM-DD). */
export const VERSION_TERMINOS = "2026-11-07";

/**
 * Mientras sea true, /privacidad y /terminos muestran que el texto está pendiente de
 * revisión legal y de los datos del responsable. Ponlo en false al publicar la versión final.
 */
export const BORRADOR_LEGAL = true;

/**
 * Datos del responsable del tratamiento. Pendientes de confirmar con el dueño del
 * proyecto antes del lanzamiento: la LFPDPPP exige nombre y domicilio del responsable.
 */
export const RESPONSABLE = {
  nombre: "Handle",
  domicilio: "Pendiente de publicar",
  correo: "Pendiente de publicar",
} as const;

/** Metadatos que viajan en el registro (signInWithOtp → raw_user_meta_data). */
export type AceptacionLegal = { terminos_version: string; privacidad_version: string };

/** Lo que se manda al crear una cuenta cuando la persona marcó la casilla de aceptación. */
export function metadatosAceptacion(): AceptacionLegal {
  return { terminos_version: VERSION_TERMINOS, privacidad_version: VERSION_PRIVACIDAD };
}

/** Mismo formato que valida la base (check en legal_acceptances): AAAA-MM-DD. */
export const FORMATO_VERSION = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha legible para "Última actualización", sin depender de la zona horaria. */
export function fechaVersion(version: string): string {
  const [a = 0, m = 1, d = 1] = version.split("-").map(Number);
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d} de ${meses[m - 1]} de ${a}`;
}
