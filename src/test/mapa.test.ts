import { describe, expect, it } from "vitest";
import {
  aNegocioPublico,
  aNegociosPublicos,
  busquedaMapa,
  conteoPorCategoria,
  conUbicacion,
  filtrarNegocios,
  horarioLegible,
  limites,
  type NegocioPublico,
} from "@/lib/mapa";

const fila = (extra: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  nombre_comercial: "  Abarrotes Doña Lupe ",
  categoria: "abarrotes",
  direccion: "Calle 5 #12, Iztapalapa",
  lat: "19.357000",
  lng: -99.07,
  horario: { "lun-sab": "8:00-21:00" },
  recomendado: false,
  puntos_porcentaje: "5.00",
  ...extra,
});

const negocio = (id: string, extra: Partial<NegocioPublico> = {}): NegocioPublico => ({
  id,
  nombre: id,
  categoria: "abarrotes",
  direccion: null,
  ubicacion: { lat: 19.4, lng: -99.1 },
  horario: [],
  recomendado: false,
  puntosPorcentaje: null,
  ...extra,
});

describe("aNegocioPublico (mapeo de datos públicos)", () => {
  it("convierte números de Postgres (numeric llega como texto) y limpia textos", () => {
    expect(aNegocioPublico(fila())).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      nombre: "Abarrotes Doña Lupe",
      categoria: "abarrotes",
      direccion: "Calle 5 #12, Iztapalapa",
      ubicacion: { lat: 19.357, lng: -99.07 },
      horario: [{ dias: "lun-sab", horas: "8:00-21:00" }],
      recomendado: false,
      puntosPorcentaje: 5,
    });
  });

  it("es lista blanca: nunca copia campos sensibles aunque la base los mande", () => {
    const n = aNegocioPublico(
      fila({
        rfc: "PELJ800101AB1",
        curp: "PELJ800101MDFRPN09",
        razon_social: "Juana Pérez López",
        telefono: "5555555555",
        clabe: "012180001234567891",
        org_id: "x",
      }),
    );
    const llaves = Object.keys(n ?? {});
    for (const sensible of ["rfc", "curp", "razon_social", "telefono", "clabe", "org_id"]) {
      expect(llaves).not.toContain(sensible);
    }
    expect(JSON.stringify(n)).not.toMatch(/PELJ|5555555555|012180|Juana/);
  });

  it("sin coordenadas válidas queda sin ubicación (no se pinta)", () => {
    expect(aNegocioPublico(fila({ lat: null, lng: null }))?.ubicacion).toBeNull();
    expect(aNegocioPublico(fila({ lat: "abc" }))?.ubicacion).toBeNull();
    expect(aNegocioPublico(fila({ lat: 120 }))?.ubicacion).toBeNull();
  });

  it("descarta filas sin id, sin nombre o con categoría desconocida", () => {
    expect(aNegocioPublico(fila({ id: null }))).toBeNull();
    expect(aNegocioPublico(fila({ nombre_comercial: "  " }))).toBeNull();
    expect(aNegocioPublico(fila({ categoria: "casino" }))).toBeNull();
    expect(aNegociosPublicos([fila(), fila({ id: null })])).toHaveLength(1);
    expect(aNegociosPublicos(null)).toEqual([]);
  });

  it("recomendado solo si es true; puntos solo si hay regla positiva", () => {
    expect(aNegocioPublico(fila({ recomendado: "true" }))?.recomendado).toBe(false);
    expect(aNegocioPublico(fila({ recomendado: true }))?.recomendado).toBe(true);
    expect(aNegocioPublico(fila({ puntos_porcentaje: null }))?.puntosPorcentaje).toBeNull();
    expect(aNegocioPublico(fila({ puntos_porcentaje: 0 }))?.puntosPorcentaje).toBeNull();
  });
});

describe("horarioLegible", () => {
  it("acepta texto u objeto día → horas e ignora lo demás", () => {
    expect(horarioLegible("Todos los días 7 a 22")).toEqual([
      { dias: "", horas: "Todos los días 7 a 22" },
    ]);
    expect(horarioLegible({ lunes: "8-20", domingo: "", martes: 3 })).toEqual([
      { dias: "lunes", horas: "8-20" },
    ]);
    expect(horarioLegible(null)).toEqual([]);
    expect(horarioLegible(["8-20"])).toEqual([]);
    expect(horarioLegible("  ")).toEqual([]);
  });

  it("acepta el arreglo ordenado que guarda /negocio", () => {
    expect(
      horarioLegible([
        { dias: "Lunes a sábado", horas: "8:00 a 21:00", desde: 0, hasta: 5 },
        { dias: "Domingo", horas: "Cerrado" },
        { dias: "Raro", horas: "" },
        "suelto",
      ]),
    ).toEqual([
      { dias: "Lunes a sábado", horas: "8:00 a 21:00" },
      { dias: "Domingo", horas: "Cerrado" },
    ]);
  });
});

describe("filtrarNegocios (HND-051)", () => {
  const lista = [
    negocio("Tacos El Güero", { categoria: "taqueria" }),
    negocio("Carnes Mary", { categoria: "carniceria", recomendado: true }),
    negocio("Abarrotes Ana"),
    negocio("Tacos Beto", { categoria: "taqueria", recomendado: true }),
  ];

  it("sin filtros devuelve todo, recomendados primero y luego por nombre", () => {
    expect(filtrarNegocios(lista, {}).map((n) => n.id)).toEqual([
      "Carnes Mary",
      "Tacos Beto",
      "Abarrotes Ana",
      "Tacos El Güero",
    ]);
  });

  it("filtra por categoría", () => {
    expect(filtrarNegocios(lista, { categoria: "taqueria" }).map((n) => n.id)).toEqual([
      "Tacos Beto",
      "Tacos El Güero",
    ]);
    expect(filtrarNegocios(lista, { categoria: "panaderia" })).toEqual([]);
  });

  it("combina categoría y solo recomendados", () => {
    expect(
      filtrarNegocios(lista, { categoria: "taqueria", recomendados: true }).map((n) => n.id),
    ).toEqual(["Tacos Beto"]);
  });

  it("no modifica la lista original", () => {
    const copia = [...lista];
    filtrarNegocios(lista, {});
    expect(lista).toEqual(copia);
  });

  it("cuenta por categoría para los chips", () => {
    expect(conteoPorCategoria(lista)).toEqual({ taqueria: 2, carniceria: 1, abarrotes: 1 });
  });
});

describe("busquedaMapa (search params)", () => {
  it("acepta filtros válidos", () => {
    expect(busquedaMapa.parse({ categoria: "taqueria", recomendados: true })).toEqual({
      categoria: "taqueria",
      recomendados: true,
    });
  });

  it("ignora valores inválidos de la URL en vez de romper la página", () => {
    expect(busquedaMapa.parse({ categoria: "casino", recomendados: "quizá" })).toEqual({
      categoria: undefined,
      recomendados: undefined,
    });
  });
});

describe("pines y encuadre", () => {
  it("conUbicacion deja fuera a los negocios sin coordenadas", () => {
    const lista = [negocio("a"), negocio("b", { ubicacion: null })];
    expect(conUbicacion(lista).map((n) => n.id)).toEqual(["a"]);
  });

  it("limites encierra todos los pines como [[oeste, sur], [este, norte]]", () => {
    expect(
      limites([
        { lat: 19.4, lng: -99.2 },
        { lat: 19.3, lng: -99.0 },
        { lat: 19.5, lng: -99.1 },
      ]),
    ).toEqual([
      [-99.2, 19.3],
      [-99.0, 19.5],
    ]);
    expect(limites([])).toBeNull();
  });
});
