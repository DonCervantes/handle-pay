// T20 · Configuración de Remotion para el video de demo (H.264, calidad alta).
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setCodec("h264");
Config.setCrf(18);
Config.setPublicDir("public");
Config.setOverwriteOutput(true);
