import { describe, expect, it } from "vitest";
import {
  erroresHorario,
  horaLegible,
  horarioATramos,
  horarioInicial,
  tramosAHorario,
  type DiaHorario,
} from "@/lib/horario";
import { horarioLegible } from "@/lib/mapa";

const abierto = (abre: string, cierra: string): DiaHorario => ({ abierto: true, abre, cierra });
const cerrado: DiaHorario = { abierto: false, abre: "08:00", cierra: "21:00" };

describe("horarioATramos", () => {
  it("agrupa días seguidos con el mismo horario y marca los cerrados", () => {
    expect(horarioATramos(horarioInicial())).toEqual([
      {
        dias: "Lunes a sábado",
        horas: "8:00 a 21:00",
        desde: 0,
        hasta: 5,
        abre: "08:00",
        cierra: "21:00",
      },
      { dias: "Domingo", horas: "Cerrado", desde: 6, hasta: 6, abre: null, cierra: null },
    ]);
  });

  it("usa 'y' para dos días y separa horarios distintos", () => {
    const dias = [
      ...Array.from({ length: 5 }, () => abierto("07:30", "22:00")),
      abierto("09:00", "15:00"),
      abierto("09:00", "15:00"),
    ];
    expect(horarioATramos(dias).map((t) => [t.dias, t.horas])).toEqual([
      ["Lunes a viernes", "7:30 a 22:00"],
      ["Sábado y domingo", "9:00 a 15:00"],
    ]);
  });

  it("todo cerrado = sin horario", () => {
    expect(horarioATramos(Array.from({ length: 7 }, () => cerrado))).toEqual([]);
  });

  it("acepta cerrar después de medianoche", () => {
    const dias = Array.from({ length: 7 }, () => abierto("19:00", "02:00"));
    expect(horarioATramos(dias)).toEqual([
      {
        dias: "Lunes a domingo",
        horas: "19:00 a 2:00",
        desde: 0,
        hasta: 6,
        abre: "19:00",
        cierra: "02:00",
      },
    ]);
    expect(erroresHorario(dias)).toEqual({});
  });

  it("lo guardado se muestra en el mapa en orden", () => {
    expect(horarioLegible(horarioATramos(horarioInicial()))).toEqual([
      { dias: "Lunes a sábado", horas: "8:00 a 21:00" },
      { dias: "Domingo", horas: "Cerrado" },
    ]);
  });
});

describe("tramosAHorario", () => {
  it("ida y vuelta conserva el horario", () => {
    const dias = [
      abierto("08:00", "21:00"),
      abierto("08:00", "21:00"),
      cerrado,
      abierto("10:00", "18:00"),
      abierto("08:00", "21:00"),
      abierto("08:00", "21:00"),
      cerrado,
    ];
    expect(tramosAHorario(horarioATramos(dias))).toEqual(dias);
  });

  it("formas que no son de esta pantalla → null", () => {
    expect(tramosAHorario(null)).toBeNull();
    expect(tramosAHorario("Lun a sáb 8-21")).toBeNull();
    expect(tramosAHorario({ "lun-sab": "8:00-21:00" })).toBeNull();
    expect(tramosAHorario([])).toBeNull();
    expect(tramosAHorario([{ dias: "Lunes", horas: "8 a 9" }])).toBeNull();
    // No cubre todos los días, o se sale de rango
    expect(tramosAHorario([{ desde: 0, hasta: 4, abre: "08:00", cierra: "20:00" }])).toBeNull();
    expect(tramosAHorario([{ desde: 3, hasta: 9, abre: null, cierra: null }])).toBeNull();
  });
});

describe("erroresHorario", () => {
  it("exige horas válidas y distintas solo en días abiertos", () => {
    const dias = horarioInicial();
    dias[0] = abierto("", "21:00");
    dias[1] = abierto("09:00", "09:00");
    dias[2] = abierto("25:00", "21:00");
    expect(Object.keys(erroresHorario(dias))).toEqual(["0", "1", "2"]);
    expect(erroresHorario(horarioInicial())).toEqual({});
  });
});

describe("horaLegible", () => {
  it("quita el cero inicial", () => {
    expect(horaLegible("08:05")).toBe("8:05");
    expect(horaLegible("18:00")).toBe("18:00");
  });
});
