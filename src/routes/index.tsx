// HND-060: landing pública para changarros. Copy de docs/03-landing.md, ajustado a las reglas
// vigentes del programa de puntos (valen solo en el negocio donde se ganaron y no son efectivo).
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Gift, MapPin, QrCode, Store, Wallet } from "lucide-react";
import { EncabezadoPublico } from "@/components/encabezado-publico";
import { PiePublico } from "@/components/pie-publico";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/metadata";

export const Route = createFileRoute("/")({
  head: () =>
    pageMeta(
      "El cobro de tu changarro, en tu mano",
      "Cobra con CoDi desde tu celular, sin terminal ni comisiones de tarjeta, y premia a tus clientes con puntos. Hecho para la tiendita de la esquina.",
    ),
  component: Landing,
});

const BENEFICIOS = [
  {
    icon: Wallet,
    titulo: "Cobra sin terminal",
    texto:
      "Genera un código QR o manda un cobro al celular de tu cliente. El dinero llega directo a tu cuenta con CoDi, sin rentar terminal ni pagar comisiones de tarjeta.",
  },
  {
    icon: Gift,
    titulo: "Premia a los de casa",
    texto:
      "Dale puntos a tus clientes frecuentes y conviértelos en descuentos. Tus clientes de confianza regresan más seguido… y gastan más.",
  },
  {
    icon: MapPin,
    titulo: "Que te encuentren",
    texto:
      "Tu negocio aparece en el mapa de Handle. Los vecinos descubren tu changarro y llegan clientes nuevos.",
  },
] as const;

const PASOS = [
  {
    icon: Store,
    titulo: "Afíliate",
    texto: "Regístrate con tu correo y sube tus datos. Validamos tu negocio para activar tus cobros.",
  },
  {
    icon: QrCode,
    titulo: "Cobra",
    texto:
      "Muestra tu QR o manda el cobro al celular de tu cliente. Paga desde su banco con CoDi en segundos.",
  },
  {
    icon: Gift,
    titulo: "Fideliza",
    texto:
      "Cada compra suma puntos a tu cliente. Esos puntos se vuelven descuentos la próxima vez que compre en tu negocio.",
  },
] as const;

const CONFIANZA = [
  "Pagos con CoDi® (del sistema de pagos de México).",
  "Tus datos y los de tus clientes, protegidos.",
  "Pensado para la tiendita de la esquina, no para corporativos.",
  "Sin mensualidad para empezar.",
] as const;

const PREGUNTAS = [
  {
    p: "¿Necesito una terminal?",
    r: "No. Cobras desde tu celular con un QR o mandando el cobro al teléfono de tu cliente.",
  },
  {
    p: "¿Qué es CoDi?",
    r: "Es la forma de cobrar y pagar del Banco de México directo entre cuentas, sin comisiones de tarjeta. Tu cliente paga desde la app de su banco.",
  },
  { p: "¿Cuánto cuesta?", r: "Empezar es gratis." },
  {
    p: "¿Cuánto tarda en activarse mi cobro?",
    r: "El registro de tu cuenta de cobro con el banco puede tardar unos días hábiles. Te avisamos cuando esté lista.",
  },
  {
    p: "¿Cómo funcionan los puntos?",
    r: "Tú decides cuántos puntos das por compra. Tus clientes los juntan y los usan como descuento en tu negocio. Los puntos no son dinero en efectivo: no se retiran ni se transfieren, son premios para tus clientes.",
  },
] as const;

function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <EncabezadoPublico />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:pt-20">
          <div className="max-w-3xl">
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              Hecho para la tiendita de la esquina
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
              Cobra con CoDi, premia a tus clientes y{" "}
              <span className="text-gold">haz crecer tu changarro.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Handle le da a tu tiendita, carnicería o taquería una forma fácil de cobrar desde el
              celular —sin terminal y sin comisiones de tarjeta— y un sistema de puntos para que tus
              clientes de confianza siempre regresen.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/auth" search={{ modo: "crear" }}>
                  Afilia tu negocio <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/mapa">
                  <MapPin /> Ver negocios en el mapa
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Pagos con CoDi® procesados de forma segura. Sin mensualidades para empezar.
            </p>
          </div>
        </section>

        {/* ¿Por qué Handle? */}
        <section aria-labelledby="por-que" className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 id="por-que" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              ¿Por qué Handle?
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {BENEFICIOS.map((b) => (
                <div key={b.titulo} className="rounded-xl border bg-card p-6 shadow-card">
                  <b.icon className="size-6 text-gold" aria-hidden />
                  <h3 className="mt-4 text-lg font-medium">{b.titulo}</h3>
                  <p className="mt-2 text-muted-foreground">{b.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ¿Cómo funciona? */}
        <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2
              id="como-funciona-titulo"
              className="text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              ¿Cómo funciona?
            </h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {PASOS.map((paso, i) => (
                <li key={paso.titulo} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-medium">{paso.titulo}</h3>
                    <p className="mt-1 text-muted-foreground">{paso.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Para el cliente */}
        <section aria-labelledby="para-cliente" className="border-t bg-accent/40">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <h2 id="para-cliente" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                También para quien compra en la esquina.
              </h2>
              <p className="mt-3 text-lg text-muted-foreground">
                Paga fácil desde tu banco, junta puntos en tu tiendita favorita y úsalos como
                descuento ahí mismo. Encuentra changarros recomendados cerca de ti en el mapa.
              </p>
            </div>
            <Button asChild size="lg" variant="outline" className="shrink-0">
              <Link to="/mapa">
                Explora el mapa <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>

        {/* Confianza */}
        <section aria-label="Confianza" className="border-t">
          <ul className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
            {CONFIANZA.map((t) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Preguntas frecuentes */}
        <section
          id="preguntas"
          aria-labelledby="preguntas-titulo"
          className="scroll-mt-20 border-t bg-muted/30"
        >
          <div className="mx-auto max-w-3xl px-4 py-16">
            <h2 id="preguntas-titulo" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Preguntas frecuentes
            </h2>
            <Accordion type="single" collapsible className="mt-6">
              {PREGUNTAS.map((f) => (
                <AccordionItem key={f.p} value={f.p}>
                  <AccordionTrigger className="text-left text-base">{f.p}</AccordionTrigger>
                  <AccordionContent className="text-base text-muted-foreground">
                    {f.r}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/auth" search={{ modo: "crear" }}>
                  Afilia tu negocio <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <PiePublico />
    </div>
  );
}
