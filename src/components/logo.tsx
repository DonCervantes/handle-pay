import { cn } from "@/lib/utils";

/**
 * Logo de Handle; cambia a la versión crema en modo oscuro.
 * Los archivos viven en public/ (HND-060), así que cargan igual en local y en producción.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-8 items-center", className)}>
      <img src="/handle-logo.svg" alt="Handle" className="h-full w-auto dark:hidden" />
      <img src="/handle-logo-dark.svg" alt="Handle" className="hidden h-full w-auto dark:block" />
    </span>
  );
}
