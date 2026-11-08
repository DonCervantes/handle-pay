import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";

/**
 * Pie de las páginas públicas (HND-060).
 * Los enlaces legales (aviso de privacidad y términos, HND-061) se agregan en la lista "Legal".
 */
export function PiePublico() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1fr_auto_auto] sm:gap-12">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            Handle © 2026 — Hecho en México 🇲🇽 para el comercio de barrio.
          </p>
        </div>
        <nav aria-label="Handle" className="space-y-2 text-sm">
          <p className="font-medium">Handle</p>
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <Link to="/auth" search={{ modo: "crear" }} className="hover:text-foreground">
                Afiliar negocio
              </Link>
            </li>
            <li>
              <Link to="/mapa" className="hover:text-foreground">
                Mapa
              </Link>
            </li>
            <li>
              <Link to="/" hash="como-funciona" className="hover:text-foreground">
                Cómo funciona
              </Link>
            </li>
            <li>
              <Link to="/" hash="preguntas" className="hover:text-foreground">
                Preguntas
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Legal" className="space-y-2 text-sm">
          <p className="font-medium">Legal</p>
          <ul className="space-y-2 text-muted-foreground">
            {/* HND-061: aviso de privacidad y términos van aquí. */}
            <li>Aviso de privacidad (próximamente)</li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
