import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Banknote, Send, Users, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Handle — El ERP ligero para PyMEs de LATAM" },
      { name: "description", content: "Finanzas, pagos a proveedores, CRM y RH en una sola plataforma pensada para México." },
      { property: "og:title", content: "Handle — El ERP ligero para PyMEs de LATAM" },
      { property: "og:description", content: "Finanzas, pagos a proveedores, CRM y RH en una sola plataforma pensada para México." },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Banknote, title: "Finanzas", text: "Ingresos, egresos y cuentas en tiempo real." },
  { icon: Send, title: "Pagos a proveedores", text: "Órdenes de pago listas para liquidarse on-chain." },
  { icon: Users, title: "Clientes", text: "CRM simple con saldos y contactos." },
  { icon: UserCog, title: "Colaboradores", text: "Directorio de tu equipo y sus datos clave." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <Button asChild variant="ghost">
          <Link to="/auth">Iniciar sesión</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-20">
        <div className="max-w-2xl">
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            Hecho para PyMEs de México
          </span>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Toda tu operación,
            <br />
            <span className="text-gold">en una sola mano.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Handle reúne finanzas, pagos a proveedores, clientes y colaboradores en un ERP ligero, claro y en español.
          </p>
          <div className="mt-10 flex gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ modo: "crear" }}>
                Crear cuenta gratis <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
        <div className="mt-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6 shadow-card">
              <f.icon className="size-5 text-gold" />
              <h3 className="mt-4 font-medium">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
