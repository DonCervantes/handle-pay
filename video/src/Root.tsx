// T20 · Composición `HandleDemo` (1920×1080, 30 fps). Las escenas llegan como props desde
// `out/props.json`, que arma `preparar.mjs` con las grabaciones (T18) y la narración (T19).
import { Composition, type CalculateMetadataFunction } from "remotion";
import { HandleDemo } from "./HandleDemo";
import { duracionEscena, FPS, type PropsVideo, segundosAFrames } from "./plan";

const calcular: CalculateMetadataFunction<PropsVideo> = ({ props }) => ({
  durationInFrames: Math.max(
    1,
    props.escenas.reduce((s, e) => s + segundosAFrames(duracionEscena(e)), 0),
  ),
});

// Valores por defecto para abrir el Studio sin preparar nada (solo el cierre, sin audio).
const PORDEFECTO: PropsVideo = {
  escenas: [{ id: "e6-cierre", numero: 6, titulo: "Handle", texto: "", audio: null, video: null }],
};

export function RemotionRoot() {
  return (
    <Composition
      id="HandleDemo"
      component={HandleDemo}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={FPS * 10}
      defaultProps={PORDEFECTO}
      calculateMetadata={calcular}
    />
  );
}
