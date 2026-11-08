// KYB (conoce a tu negocio): catálogos, validaciones y reglas del expediente.
// Puro y sin dependencias: lo usan la pantalla "Mi negocio", la revisión de la red
// y los tests. La base de datos repite las reglas críticas (no confía en la app).
import type { Database } from "@/integrations/supabase/types";

type Enums = Database["public"]["Enums"];
export type Categoria = Enums["categoria_negocio"];
export type TipoPersona = Enums["tipo_persona"];
export type TipoDocumento = Enums["tipo_documento_kyb"];
export type EstadoKyb = Enums["estado_kyb"];

export const CATEGORIAS: { valor: Categoria; etiqueta: string }[] = [
  { valor: "abarrotes", etiqueta: "Abarrotes" },
  { valor: "carniceria", etiqueta: "Carnicería" },
  { valor: "taqueria", etiqueta: "Taquería" },
  { valor: "tortilleria", etiqueta: "Tortillería" },
  { valor: "panaderia", etiqueta: "Panadería" },
  { valor: "fruteria", etiqueta: "Frutería" },
  { valor: "tienda", etiqueta: "Tienda" },
  { valor: "otro", etiqueta: "Otro" },
];

export const DOCUMENTOS: { tipo: TipoDocumento; etiqueta: string; ayuda: string }[] = [
  {
    tipo: "ine",
    etiqueta: "Identificación oficial (INE)",
    ayuda: "De la persona dueña o representante legal, por ambos lados.",
  },
  {
    tipo: "constancia_fiscal",
    etiqueta: "Constancia de situación fiscal",
    ayuda: "Descárgala del portal del SAT. Que no tenga más de 3 meses.",
  },
  {
    tipo: "comprobante_domicilio",
    etiqueta: "Comprobante de domicilio del negocio",
    ayuda: "Recibo de luz, agua o teléfono de los últimos 3 meses.",
  },
  {
    tipo: "titularidad_cuenta",
    etiqueta: "Estado de cuenta bancario",
    ayuda: "La primera hoja, donde se vea el titular y la CLABE de la cuenta donde vas a cobrar.",
  },
];

export const ARCHIVOS_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const TAMANO_MAXIMO = 10 * 1024 * 1024; // igual que el límite del bucket "kyb"

/** Solo en estos estados el dueño puede editar datos y documentos. */
export function expedienteEditable(estado: EstadoKyb | null | undefined): boolean {
  return !estado || estado === "borrador" || estado === "rechazado";
}

// -----------------------------------------------------------------------------
// Validaciones
// -----------------------------------------------------------------------------

/** Mayúsculas y sin espacios ni guiones (como se capturan RFC y CURP). */
export function normalizarClave(valor: string): string {
  return valor.toUpperCase().replace(/[\s-]+/g, "");
}

export function soloDigitos(valor: string): string {
  return valor.replace(/\D+/g, "");
}

/** AAMMDD con mes y día posibles (el siglo no se puede saber, se acepta el 29 de febrero). */
export function fechaClaveValida(aammdd: string): boolean {
  if (!/^\d{6}$/.test(aammdd)) return false;
  const mes = Number(aammdd.slice(2, 4));
  const dia = Number(aammdd.slice(4, 6));
  const diasPorMes = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasPorMes[mes - 1]!;
}

const RFC_FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;
const RFC_MORAL = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
const CURP = /^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d$/;

/** Devuelve un mensaje de error o null si el RFC es válido para ese tipo de persona. */
export function validarRfc(rfc: string, tipo: TipoPersona): string | null {
  const v = normalizarClave(rfc);
  if (tipo === "fisica" && v.length !== 13) return "El RFC de persona física tiene 13 caracteres.";
  if (tipo === "moral" && v.length !== 12) return "El RFC de persona moral tiene 12 caracteres.";
  if (!(tipo === "fisica" ? RFC_FISICA : RFC_MORAL).test(v))
    return "Revisa el RFC: el formato no es válido.";
  const fecha = tipo === "fisica" ? v.slice(4, 10) : v.slice(3, 9);
  if (!fechaClaveValida(fecha)) return "Revisa el RFC: la fecha que contiene no existe.";
  return null;
}

export function validarCurp(curp: string): string | null {
  const v = normalizarClave(curp);
  if (v.length !== 18) return "La CURP tiene 18 caracteres.";
  if (!CURP.test(v)) return "Revisa la CURP: el formato no es válido.";
  if (!fechaClaveValida(v.slice(4, 10))) return "Revisa la CURP: la fecha de nacimiento no existe.";
  return null;
}

// -----------------------------------------------------------------------------
// Expediente
// -----------------------------------------------------------------------------

export type DatosExpediente = {
  nombre_comercial: string;
  tipo_persona: TipoPersona;
  razon_social: string;
  rfc: string;
  curp: string;
  categoria: Categoria;
  telefono: string;
  direccion: string;
  cp: string;
};

export const ETIQUETAS_CAMPOS: Record<keyof DatosExpediente, string> = {
  nombre_comercial: "Nombre del negocio",
  tipo_persona: "Tipo de persona",
  razon_social: "Nombre o razón social",
  rfc: "RFC",
  curp: "CURP",
  categoria: "Giro",
  telefono: "Teléfono",
  direccion: "Dirección",
  cp: "Código postal",
};

export type ErroresExpediente = Partial<Record<keyof DatosExpediente, string>>;

/** Limpia lo capturado: claves en mayúsculas, teléfono solo dígitos, textos sin espacios extra. */
export function limpiarExpediente(d: DatosExpediente): DatosExpediente {
  return {
    ...d,
    nombre_comercial: d.nombre_comercial.trim(),
    razon_social: d.razon_social.trim(),
    rfc: normalizarClave(d.rfc),
    // La persona moral no tiene CURP.
    curp: d.tipo_persona === "fisica" ? normalizarClave(d.curp) : "",
    telefono: soloDigitos(d.telefono),
    direccion: d.direccion.trim().replace(/\s+/g, " "),
    cp: d.cp.trim(),
  };
}

/**
 * Errores de lo capturado. Con `completo: false` (guardar borrador) solo exige el
 * nombre del negocio y revisa el formato de lo que ya se escribió; con
 * `completo: true` (enviar a revisión) además exige todo.
 */
export function erroresExpediente(
  datos: DatosExpediente,
  { completo }: { completo: boolean },
): ErroresExpediente {
  const d = limpiarExpediente(datos);
  const e: ErroresExpediente = {};
  const falta = (campo: keyof DatosExpediente) => {
    if (completo) e[campo] = `Falta ${ETIQUETAS_CAMPOS[campo].toLowerCase()}.`;
  };

  if (d.nombre_comercial.length < 2) e.nombre_comercial = "Escribe el nombre de tu negocio.";

  if (!d.razon_social) falta("razon_social");
  else if (d.razon_social.length < 3)
    e.razon_social = "Escribe el nombre completo o la razón social.";

  if (!d.rfc) falta("rfc");
  else {
    const error = validarRfc(d.rfc, d.tipo_persona);
    if (error) e.rfc = error;
  }

  if (d.tipo_persona === "fisica") {
    if (!d.curp) falta("curp");
    else {
      const error = validarCurp(d.curp);
      if (error) e.curp = error;
    }
  }

  if (!d.telefono) falta("telefono");
  else if (d.telefono.length !== 10) e.telefono = "El teléfono debe tener 10 dígitos.";

  if (!d.direccion) falta("direccion");
  else if (d.direccion.length < 8) e.direccion = "Escribe calle, número y colonia.";

  if (!d.cp) falta("cp");
  else if (!/^\d{5}$/.test(d.cp)) e.cp = "El código postal tiene 5 dígitos.";

  return e;
}

/** Lista legible de lo que falta para poder enviar el expediente a revisión. */
export function faltantesParaEnviar(
  datos: DatosExpediente | null,
  documentosSubidos: readonly TipoDocumento[],
): string[] {
  const faltan: string[] = [];
  if (!datos) faltan.push("Guardar los datos del negocio");
  else {
    for (const campo of Object.keys(
      erroresExpediente(datos, { completo: true }),
    ) as (keyof DatosExpediente)[]) {
      faltan.push(`Revisar o completar: ${ETIQUETAS_CAMPOS[campo]}`);
    }
  }
  for (const doc of DOCUMENTOS) {
    if (!documentosSubidos.includes(doc.tipo)) faltan.push(`Subir: ${doc.etiqueta}`);
  }
  return faltan;
}
