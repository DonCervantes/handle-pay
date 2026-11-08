// T20 · Pruebas de la lógica pura del video: `node --test src/plan.test.ts` (Node ≥ 23, sin compilar).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ajustarVideo, COLA, dividirFrases, duracionEscena, ENTRADA_VOZ, type Escena, subtitulos, type Video } from "./plan.ts";

const video = (duracion: number): Video => ({ src: "x.webm", ancho: 1920, alto: 1080, duracion, recorteInicio: 0, dispositivo: "compu" });
const escena = (voz: number, v: Video | null): Escena => ({ id: "e", numero: 1, titulo: "t", texto: "", audio: { src: "a.mp3", duracion: voz }, video: v });

test("la escena dura lo que la voz más entrada y cola (nunca corta la narración)", () => {
  assert.equal(duracionEscena(escena(50, video(10))), ENTRADA_VOZ + 50 + COLA);
  assert.equal(duracionEscena(escena(2, video(10))), 6);
});

test("grabación corta: velocidad normal y último cuadro congelado", () => {
  const a = ajustarVideo(video(20), 40);
  assert.equal(a.velocidad, 1);
  assert.equal(a.segundosCortados, 0);
  assert.ok(a.segundosCongelados > 19);
  assert.equal(a.framesReproduccion, Math.floor((20 - 0.15) * 30));
});

test("grabación algo larga: acelera suave sin pasar de 1.25×", () => {
  const a = ajustarVideo(video(45.15), 40);
  assert.ok(a.velocidad > 1 && a.velocidad <= 1.25);
  assert.equal(a.segundosCortados, 0);
  assert.equal(a.framesReproduccion, 40 * 30);
});

test("grabación muy larga: 1.25× y recorta el final", () => {
  const a = ajustarVideo(video(100.15), 40);
  assert.equal(a.velocidad, 1.25);
  assert.equal(a.segundosCortados, 50);
  assert.equal(a.framesReproduccion, 40 * 30);
});

test("subtítulos: una frase por oración, repartidos en toda la voz", () => {
  const texto = "Esta es Santa María la Ribera. ¿Ves las estrellas? Son los recomendados por la red.";
  const subs = subtitulos(texto, 9);
  assert.equal(subs.length, 3);
  assert.equal(subs[0]?.desde, 0);
  assert.equal(subs.at(-1)?.hasta, 9);
  for (let i = 1; i < subs.length; i++) assert.equal(subs[i]?.desde, subs[i - 1]?.hasta);
});

test("subtítulos: frases largas se parten por comas y quedan legibles", () => {
  const larga =
    "En un vistazo ve cuánto vendió hoy con CoDi, cuántos cobros lleva, su ticket promedio y quién cobró: ella o Beto, su cajero.";
  const partes = dividirFrases(larga);
  assert.ok(partes.length >= 2);
  assert.ok(partes.every((p) => p.length <= 95));
  assert.equal(partes.join(" "), larga);
});
