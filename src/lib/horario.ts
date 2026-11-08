// Horario del negocio (mejora Fase 5): lo captura la gerencia en /negocio y lo muestra el mapa.
// Lógica pura (sin Supabase) para poder probarla.
//
// Se guarda en businesses.horario como arreglo, porque jsonb reordena las llaves de un objeto
// y el orden de los días importa:
//   [{ "dias": "Lunes a sábado", "horas": "8:00 a 21:00", "desde": 0, "hasta": 5,
//      "abre": "08:00", "cierra": "21:00" },
//    { "dias": "Domingo", "horas": "Cerrado", "desde": 6, "hasta": 6, "abre": null, "cierra": null }]
// "dias" y "horas" son lo que se muestra; el resto sirve para volver a editarlo.

export const DIAS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

export type DiaHorario = { abierto: boolean; abre: string; cierra: string };

export type TramoHorario = {
  dias: string;
  horas: string;
  desde: number;
  hasta: number;
  abre: string | null;
  cierra: string | null;
};

/** Lunes a sábado de 8:00 a 21:00 y domingo cerrado: lo típico de una tiendita. */
export function horarioInicial(): DiaHorario[] {
  return DIAS.map((_, i) => ({ abierto: i < 6, abre: "08:00", cierra: "21:00" }));
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "08:00" → "8:00". */
export function horaLegible(h: string): string {
  return h.replace(/^0(\d)/, "$1");
}

/** Errores por día (índice → mensaje). Vacío si se puede guardar. */
export function erroresHorario(dias: DiaHorario[]): Record<number, string> {
  const errores: Record<number, string> = {};
  dias.forEach((d, i) => {
    if (!d.abierto) return;
    if (!HORA.test(d.abre) || !HORA.test(d.cierra)) errores[i] = "Indica a qué hora abres y cierras.";
    else if (d.abre === d.cierra) errores[i] = "La hora de cierre debe ser distinta a la de apertura.";
  });
  return errores;
}

function nombreTramo(desde: number, hasta: number): string {
  if (desde === hasta) return DIAS[desde]!;
  if (hasta === desde + 1) return `${DIAS[desde]} y ${DIAS[hasta]!.toLowerCase()}`;
  return `${DIAS[desde]} a ${DIAS[hasta]!.toLowerCase()}`;
}

const mismoHorario = (a: DiaHorario, b: DiaHorario) =>
  a.abierto === b.abierto && (!a.abierto || (a.abre === b.abre && a.cierra === b.cierra));

/** Agrupa días seguidos con el mismo horario. Si todo está cerrado devuelve [] (= sin horario). */
export function horarioATramos(dias: DiaHorario[]): TramoHorario[] {
  if (dias.every((d) => !d.abierto)) return [];
  const tramos: TramoHorario[] = [];
  let inicio = 0;
  for (let i = 1; i <= dias.length; i++) {
    if (i < dias.length && mismoHorario(dias[i]!, dias[inicio]!)) continue;
    const d = dias[inicio]!;
    tramos.push({
      dias: nombreTramo(inicio, i - 1),
      horas: d.abierto ? `${horaLegible(d.abre)} a ${horaLegible(d.cierra)}` : "Cerrado",
      desde: inicio,
      hasta: i - 1,
      abre: d.abierto ? d.abre : null,
      cierra: d.abierto ? d.cierra : null,
    });
    inicio = i;
  }
  return tramos;
}

/**
 * Lo guardado → los 7 días del formulario. Si el horario no tiene la forma que guarda esta
 * pantalla (texto libre, objeto, vacío), devuelve null para empezar con el horario inicial.
 */
export function tramosAHorario(guardado: unknown): DiaHorario[] | null {
  if (!Array.isArray(guardado) || guardado.length === 0) return null;
  const dias: (DiaHorario | null)[] = DIAS.map(() => null);
  for (const t of guardado) {
    if (!t || typeof t !== "object") return null;
    const { desde, hasta, abre, cierra } = t as Record<string, unknown>;
    if (
      !Number.isInteger(desde) ||
      !Number.isInteger(hasta) ||
      (desde as number) < 0 ||
      (hasta as number) > 6 ||
      (desde as number) > (hasta as number)
    ) {
      return null;
    }
    const abierto = typeof abre === "string" && typeof cierra === "string";
    for (let i = desde as number; i <= (hasta as number); i++) {
      dias[i] = abierto
        ? { abierto, abre: abre as string, cierra: cierra as string }
        : { abierto: false, abre: "08:00", cierra: "21:00" };
    }
  }
  return dias.every((d) => d !== null) ? (dias as DiaHorario[]) : null;
}
