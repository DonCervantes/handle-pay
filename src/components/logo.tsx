import { useState } from "react";
import logoLight from "@/assets/handle-logo.png.asset.json";
import logoDark from "@/assets/handle-logo-dark.png.asset.json";
import { cn } from "@/lib/utils";

/**
 * Logo de Handle; cambia a la versión crema en modo oscuro.
 * Si la imagen no carga (hoy vive en el almacén de assets de Lovable y en local
 * responde 404), muestra la palabra "Handle" en lugar de una imagen rota.
 * La imagen definitiva se mueve a public/ en HND-060.
 */
export function Logo({ className }: { className?: string }) {
  const [fallo, setFallo] = useState(false);
  if (fallo) {
    return (
      <span
        className={cn("inline-flex h-8 items-center text-lg font-bold tracking-tight", className)}
      >
        Handle
      </span>
    );
  }
  return (
    <span className={cn("inline-flex h-8 items-center", className)}>
      <img
        src={logoLight.url}
        alt="Handle"
        className="h-full w-auto dark:hidden"
        onError={() => setFallo(true)}
      />
      <img
        src={logoDark.url}
        alt="Handle"
        className="hidden h-full w-auto dark:block"
        onError={() => setFallo(true)}
      />
    </span>
  );
}
