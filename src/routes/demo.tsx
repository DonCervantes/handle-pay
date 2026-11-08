// T14 · Entrar sin correo a las cuentas de demostración (solo con DEMO_MODE=true en desarrollo).
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, QrCode, ShieldCheck, Store, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EncabezadoPublico } from "@/components/encabezado-publico";
import { Button } from "@/components/ui/button";
import { entrarComoDemo, estadoDemo } from "@/lib/demo.functions";
import { pageMeta } from "@/lib/metadata";
import { cuentaDemo } from "@/lib/demo";
import type { PerfilDemo } from "@/lib/modo-demo";
import { inicioPorRol } from "@/lib/roles";

export const Route = createFileRoute("/demo")({
  head: () => {
    const { meta } = pageMeta("Demo", "Prueba Handle como dueña, cajero, cliente o red de afiliados, sin correo.");
    // Nunca indexar esta página.
    return { meta: [...meta, { name: "robots", content: "noindex, nofollow" }] };
  },
  loader: () => estadoDemo(),
  component: PaginaDemo,
});

type Opcion = { perfil: PerfilDemo; titulo: string; icono: ReactNode };

const OPCIONES: readonly Opcion[] = [
  {
    perfil: "duena",
    titulo: "Entrar como dueña",
    icono: <Store className="size-5" />,
  },
  {
    perfil: "cajero",
    titulo: "Entrar como cajero",
    icono: <QrCode className="size-5" />,
  },
  {
    perfil: "cliente",
    titulo: "Entrar como cliente",
    icono: <Wallet className="size-5" />,
  },
  {
    perfil: "red",
    titulo: "Entrar como red",
    icono: <ShieldCheck className="size-5" />,
  },
];

function PaginaDemo() {
  const { activo } = Route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [entrando, setEntrando] = useState<PerfilDemo | null>(null);

  async function entrar(perfil: PerfilDemo) {
    setEntrando(perfil);
    try {
      const { tokenHash, rol } = await entrarComoDemo({ data: { perfil } });
      // Cambiar de cuenta: se cierra la sesión anterior solo en este dispositivo.
      await supabase.auth.signOut({ scope: "local" });
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (error) throw error;
      queryClient.clear();
      await navigate({ to: inicioPorRol(rol), replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo entrar a la demo.");
      setEntrando(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <EncabezadoPublico />
      <main className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
        {activo ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Prueba Handle</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Elige con quién quieres entrar. Son cuentas de demostración: los cobros son simulados y no se mueve
              dinero real.
            </p>
            <ul className="mt-6 grid gap-3">
              {OPCIONES.map((o) => (
                <li key={o.perfil}>
                  <button
                    type="button"
                    onClick={() => void entrar(o.perfil)}
                    disabled={entrando !== null}
                    className="flex w-full items-center gap-4 rounded-xl border bg-card px-4 py-4 text-left shadow-sm transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                      {entrando === o.perfil ? <Loader2 className="size-5 animate-spin" /> : o.icono}
                    </span>
                    <span>
                      <span className="block text-base font-semibold">{o.titulo}</span>
                      <span className="block text-sm font-medium">{cuentaDemo(o.perfil).nombre}</span>
                      <span className="block text-sm text-muted-foreground">{cuentaDemo(o.perfil).descripcion}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-muted-foreground">
              ¿Solo quieres ver los negocios?{" "}
              <Link to="/mapa" className="font-medium text-foreground underline underline-offset-2">
                Abre el mapa
              </Link>
              , no necesitas cuenta.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">La demo no está disponible</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Para entrar a Handle usa tu correo; te mandamos un enlace.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/auth">Entrar con mi correo</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/mapa">Ver el mapa</Link>
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
