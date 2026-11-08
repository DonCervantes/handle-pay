// Reglas de cobro CoDi que comparten la caja, el servidor y los tests.

/** Tiempo que vive un cobro (QR o push) antes de vencer, en segundos. Pey pide 360 como mínimo. */
export const VIGENCIA_COBRO_SEG = 600;
/** Límite de Pey para un cobro por push y de la tabla charges. */
export const MONTO_MAXIMO = 1_000_000;

/**
 * CLABE: 18 dígitos y el último es un dígito verificador. Se calcula con los
 * pesos 3, 7, 1 sobre los primeros 17 dígitos (módulo 10). Atrapa errores de captura.
 */
export function validarClabe(clabe: string): string | null {
  const v = clabe.replace(/\D+/g, "");
  if (v.length !== 18) return "La CLABE tiene 18 dígitos.";
  const pesos = [3, 7, 1];
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += (Number(v[i]) * pesos[i % 3]!) % 10;
  const verificador = (10 - (suma % 10)) % 10;
  if (verificador !== Number(v[17])) return "Revisa la CLABE: el dígito verificador no coincide.";
  return null;
}

/** Monto en pesos con hasta 2 decimales; null si no es un monto válido para cobrar. */
export function leerMonto(texto: string): number | null {
  const limpio = texto.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const monto = Number(limpio);
  return monto > 0 && monto <= MONTO_MAXIMO ? monto : null;
}

/** Teléfono celular mexicano de 10 dígitos (CoDi push). */
export function telefonoValido(texto: string): string | null {
  const v = texto.replace(/\D+/g, "");
  return /^\d{10}$/.test(v) ? v : null;
}

/** Concepto que ve quien paga; CoDi muestra textos cortos. */
export function conceptoCobro(negocio: string, detalle?: string): string {
  const texto = detalle?.trim() ? `${negocio} · ${detalle.trim()}` : negocio;
  return texto.slice(0, 40);
}

/** Un cobro pendiente vence a los VIGENCIA_COBRO_SEG; después ya no se puede pagar. */
export function cobroVencido(creadoEn: string | Date, ahora: Date = new Date()): boolean {
  return ahora.getTime() - new Date(creadoEn).getTime() > VIGENCIA_COBRO_SEG * 1000;
}
