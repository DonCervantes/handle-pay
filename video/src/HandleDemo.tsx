// T20 · Composición del video de demo: por escena, tarjeta de título, grabación ajustada a la voz,
// narración y subtítulos; al final, cierre con el logo.
import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Freeze,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  Series,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  type Ajuste,
  ajustarVideo,
  duracionEscena,
  ENTRADA_VOZ,
  type Escena,
  type Imagen,
  type PropsVideo,
  segundosAFrames,
  subtitulos,
  TARJETA,
  type Video,
} from "./plan";

// Colores de la app (src/styles.css y public/handle-logo.svg).
export const COLOR = {
  fondo: "#f5f2ea",
  crema: "#ece6d8",
  tinta: "#1d1b18",
  oro: "#b9a37b",
  gris: "#6f685d",
};
export const LETRA = "'General Sans', 'Satoshi', -apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif";

export function HandleDemo({ escenas }: PropsVideo) {
  return (
    <AbsoluteFill style={{ backgroundColor: COLOR.tinta, fontFamily: LETRA }}>
      <Series>
        {escenas.map((e) => (
          <Series.Sequence key={e.id} durationInFrames={segundosAFrames(duracionEscena(e))} name={e.id}>
            {e.video ? (
              <EscenaGrabada escena={e} video={e.video} />
            ) : e.imagenes?.length ? (
              <EscenaCapturas escena={e} imagenes={e.imagenes} />
            ) : (
              <Cierre escena={e} />
            )}
            {e.audio ? (
              <Sequence from={segundosAFrames(ENTRADA_VOZ)} name="voz">
                <Audio src={staticFile(e.audio.src)} />
              </Sequence>
            ) : null}
            {e.audio ? <Subtitulos texto={e.texto} duracion={e.audio.duracion} /> : null}
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
}

/* ---------- Marca ---------- */

/** Las dos "esquinas" del logo de Handle. */
function Marca({ tam, entrada = 1 }: { tam: number; entrada?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 36 36" style={{ display: "block" }}>
      <path d="M17 2A15 15 0 0 0 2 17H17Z" fill={COLOR.tinta} transform={`translate(${(1 - entrada) * -6} ${(1 - entrada) * -6})`} />
      <path d="M19 34A15 15 0 0 0 34 19H19Z" fill={COLOR.oro} transform={`translate(${(1 - entrada) * 6} ${(1 - entrada) * 6})`} />
    </svg>
  );
}

/* ---------- Escena con grabación ---------- */

function EscenaGrabada({ escena, video }: { escena: Escena; video: Video }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ajuste = ajustarVideo(video, duracionEscena(escena));
  const finTarjeta = segundosAFrames(TARJETA);
  // La grabación aparece con un zoom suave mientras sale la tarjeta.
  const zoom = interpolate(frame, [finTarjeta - 10, finTarjeta + 20], [1.035, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const reproduccion = <Reproduccion video={video} ajuste={ajuste} />;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        {video.dispositivo === "celular" ? <MarcoCelular video={video}>{reproduccion}</MarcoCelular> : reproduccion}
      </AbsoluteFill>
      <Rotulo escena={escena} />
      <Tarjeta escena={escena} fps={fps} />
    </AbsoluteFill>
  );
}

/** La grabación corre a la velocidad ajustada y, si se acaba antes que la voz, se congela su último cuadro. */
function Reproduccion({ video, ajuste }: { video: Video; ajuste: Ajuste }) {
  const clip = (
    <OffthreadVideo
      src={staticFile(video.src)}
      muted
      {...(ajuste.framesRecorteInicio > 0 ? { trimBefore: ajuste.framesRecorteInicio } : {})}
      playbackRate={ajuste.velocidad}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
  return (
    <>
      <Sequence durationInFrames={ajuste.framesReproduccion} name="grabación">
        {clip}
      </Sequence>
      <Sequence from={ajuste.framesReproduccion} name="último cuadro">
        <Freeze frame={ajuste.framesReproduccion - 1}>{clip}</Freeze>
      </Sequence>
    </>
  );
}

/** Grabación vertical (390×844 de T18): dentro de un teléfono, centrado sobre fondo de marca. */
function MarcoCelular({ video, children }: { video: Video; children: ReactNode }) {
  const alto = 940;
  const ancho = Math.round((alto * video.ancho) / video.alto);
  return (
    <AbsoluteFill style={{ background: FONDO_CELULAR }}>
      <Telefono izq={(1920 - ancho) / 2} arriba={(1080 - alto) / 2} ancho={ancho} alto={alto}>
        {children}
      </Telefono>
    </AbsoluteFill>
  );
}

const FONDO_CELULAR = `radial-gradient(circle at 50% 40%, ${COLOR.fondo} 0%, ${COLOR.crema} 75%)`;

/** Cuerpo de teléfono (bisel oscuro y pantalla redondeada); el radio escala con el alto (940 → 48). */
function Telefono({ izq, arriba, ancho, alto, children }: { izq: number; arriba: number; ancho: number; alto: number; children: ReactNode }) {
  const k = alto / 940;
  const bisel = 14 * k;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: izq - bisel,
          top: arriba - bisel,
          width: ancho + bisel * 2,
          height: alto + bisel * 2,
          borderRadius: 62 * k,
          background: COLOR.tinta,
          boxShadow: "0 40px 90px rgba(29,27,24,0.35)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: izq,
          top: arriba,
          width: ancho,
          height: alto,
          borderRadius: 48 * k,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        {children}
      </div>
    </>
  );
}

/* ---------- Escena con capturas (T24: prueba real con la app del banco) ---------- */

const PUNTOS_EVIDENCIA = ["Monto: $0.01", "Concepto del negocio", "QR CoDi válido"];

/**
 * Las capturas (ya limpias por video/evidencias/limpiar.mjs) entran una tras otra en teléfonos a la
 * derecha; a la izquierda, el rótulo de la prueba y lo que el banco reconoce.
 */
function EscenaCapturas({ escena, imagenes }: { escena: Escena; imagenes: Imagen[] }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const inicio = segundosAFrames(TARJETA) - 6;
  // La segunda captura entra cuando la voz llega al banco (~40 % de la escena).
  const separacion = Math.max(segundosAFrames(2.5), Math.round(durationInFrames * 0.38));
  const alto = 800;
  const arriba = 54;
  const hueco = 56;
  const anchos = imagenes.map((im) => Math.round((alto * im.ancho) / im.alto));
  const total = anchos.reduce((s, a) => s + a, 0) + hueco * (imagenes.length - 1);
  const derecha = 1920 - 150;
  const texto = spring({ frame: frame - inicio, fps, config: { damping: 200 }, durationInFrames: 24 });
  return (
    <AbsoluteFill style={{ background: FONDO_CELULAR }}>
      {imagenes.map((im, i) => {
        const izq = derecha - total + anchos.slice(0, i).reduce((s, a) => s + a + hueco, 0);
        const a = spring({ frame: frame - inicio - i * separacion, fps, config: { damping: 200 }, durationInFrames: 28 });
        // Un acercamiento muy lento mientras está en pantalla (sin recortar datos de la captura).
        const deriva = interpolate(frame, [inicio, durationInFrames], [1, 1.02], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <AbsoluteFill
            key={im.src}
            style={{ opacity: a, transform: `translateY(${(1 - a) * 70}px) scale(${deriva})`, transformOrigin: "75% 45%" }}
          >
            <Telefono izq={izq} arriba={arriba} ancho={anchos[i] ?? 0} alto={alto}>
              <Img src={staticFile(im.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </Telefono>
          </AbsoluteFill>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 190,
          width: 1920 - 150 - total - 150 - 90,
          opacity: texto,
          transform: `translateY(${(1 - texto) * 30}px)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Marca tam={46} />
          <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: 4, color: COLOR.oro, textTransform: "uppercase" }}>
            {escena.etiqueta ?? escena.titulo}
          </span>
        </div>
        <div style={{ marginTop: 26, fontSize: 70, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.06, color: COLOR.tinta }}>
          Un QR CoDi real, leído por el banco
        </div>
        {escena.rotulo ? (
          <div
            style={{
              marginTop: 36,
              display: "inline-block",
              padding: "14px 26px",
              borderRadius: 999,
              background: COLOR.tinta,
              color: COLOR.fondo,
              fontSize: 30,
              fontWeight: 600,
            }}
          >
            {escena.rotulo}
          </div>
        ) : null}
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 18 }}>
          {PUNTOS_EVIDENCIA.map((p, i) => {
            const b = spring({ frame: frame - inicio - separacion - 10 - i * 10, fps, config: { damping: 200 }, durationInFrames: 18 });
            return (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 16, opacity: b, transform: `translateX(${(1 - b) * -20}px)` }}>
                <div style={{ width: 14, height: 14, borderRadius: 7, background: COLOR.oro }} />
                <span style={{ fontSize: 34, fontWeight: 500, color: COLOR.tinta }}>{p}</span>
              </div>
            );
          })}
        </div>
      </div>
      <Tarjeta escena={escena} fps={fps} />
    </AbsoluteFill>
  );
}

/** Tarjeta de título a pantalla completa al inicio de cada escena; sale hacia arriba. */
function Tarjeta({ escena, fps }: { escena: Escena; fps: number }) {
  const frame = useCurrentFrame();
  const salida = segundosAFrames(TARJETA);
  const entrada = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 18 });
  const fuera = interpolate(frame, [salida - 8, salida + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (frame > salida + 8) return null;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLOR.fondo,
        justifyContent: "center",
        alignItems: "flex-start",
        paddingLeft: 180,
        opacity: 1 - fuera,
        transform: `translateY(${-fuera * 60}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28, opacity: entrada }}>
        <Marca tam={88} entrada={entrada} />
        <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: 4, color: COLOR.oro, textTransform: "uppercase" }}>
          {escena.etiqueta ?? (escena.numero === 0 ? "Handle" : `Escena ${escena.numero}`)}
        </span>
      </div>
      <div
        style={{
          marginTop: 30,
          fontSize: 92,
          fontWeight: 700,
          letterSpacing: -2,
          color: COLOR.tinta,
          maxWidth: 1500,
          lineHeight: 1.05,
          opacity: entrada,
          transform: `translateY(${(1 - entrada) * 30}px)`,
        }}
      >
        {escena.titulo}
      </div>
      <div style={{ marginTop: 40, height: 8, width: 220 * entrada, background: COLOR.oro, borderRadius: 4 }} />
    </AbsoluteFill>
  );
}

/** Rótulo pequeño arriba a la izquierda que queda unos segundos después de la tarjeta. */
function Rotulo({ escena }: { escena: Escena }) {
  const frame = useCurrentFrame();
  const desde = segundosAFrames(TARJETA);
  const hasta = desde + segundosAFrames(5);
  const op = interpolate(frame, [desde, desde + 12, hasta - 12, hasta], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (op <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 48,
        bottom: 190,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 26px 14px 18px",
        borderRadius: 999,
        background: "rgba(245,242,234,0.96)",
        boxShadow: "0 10px 30px rgba(29,27,24,0.25)",
        opacity: op,
        transform: `translateX(${(1 - op) * 30}px)`,
      }}
    >
      <Marca tam={38} />
      <span style={{ fontSize: 28, fontWeight: 600, color: COLOR.tinta }}>{escena.titulo}</span>
    </div>
  );
}

/* ---------- Subtítulos ---------- */

function Subtitulos({ texto, duracion }: { texto: string; duracion: number }) {
  const frame = useCurrentFrame();
  const t = frame / 30 - ENTRADA_VOZ;
  const actual = subtitulos(texto, duracion).find((s) => t >= s.desde && t < s.hasta);
  if (!actual) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 64, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          maxWidth: 1500,
          padding: "16px 34px",
          borderRadius: 18,
          background: "rgba(29,27,24,0.82)",
          color: "#fff",
          fontSize: 44,
          fontWeight: 500,
          lineHeight: 1.3,
          textAlign: "center",
        }}
      >
        {actual.texto}
      </div>
    </div>
  );
}

/* ---------- Cierre ---------- */

function Cierre(_: { escena: Escena }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  const puntos = ["Cobro con CoDi, sin comisiones de tarjeta", "Un programa de lealtad propio", "Clientes nuevos que la encuentran en el mapa"];
  return (
    <AbsoluteFill style={{ backgroundColor: COLOR.fondo, justifyContent: "center", alignItems: "center" }}>
      <Img
        src={staticFile("handle-logo.svg")}
        style={{ width: 760, opacity: logo, transform: `translateY(${(1 - logo) * 40}px) scale(${0.94 + logo * 0.06})` }}
      />
      <div style={{ marginTop: 56, display: "flex", flexDirection: "column", gap: 22, alignItems: "center" }}>
        {puntos.map((p, i) => {
          const a = spring({ frame: frame - 24 - i * 14, fps, config: { damping: 200 }, durationInFrames: 20 });
          return (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 18, opacity: a, transform: `translateY(${(1 - a) * 20}px)` }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: COLOR.oro }} />
              <span style={{ fontSize: 44, fontWeight: 500, color: COLOR.tinta }}>{p}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
