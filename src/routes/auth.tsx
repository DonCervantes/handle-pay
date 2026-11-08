import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { AuthError } from "@supabase/supabase-js";
import { Gift, Loader2, Mail, MapPin, QrCode, ShoppingBag, Store } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/logo";
import { EnlacesLegales } from "@/components/enlaces-legales";
import { metadatosAceptacion, type AceptacionLegal } from "@/lib/legal";
import { inicioPorRol } from "@/lib/roles";
import { cn } from "@/lib/utils";

type Modo = "entrar" | "crear";
type TipoCuenta = "negocio" | "cliente";
// Las versiones aceptadas quedan registradas en legal_acceptances (trigger en auth.users).
type DatosRegistro = { full_name: string; tipo_cuenta: TipoCuenta; org_name?: string } & AceptacionLegal;
type Enviado = { email: string; modo: Modo; datos?: DatosRegistro };

const searchSchema = z.object({
  modo: z.enum(["entrar", "crear"]).optional().catch(undefined),
  // La protección de rutas lo agrega cuando expulsa a una cuenta dada de baja.
  motivo: z.enum(["baja"]).optional().catch(undefined),
});

// Segundos antes de poder pedir otro enlace (Supabase limita los envíos por correo).
const ESPERA_REENVIO = 60;

const MENSAJE_BAJA = "Tu acceso fue dado de baja. Si crees que es un error, habla con el dueño del negocio.";

export const Route = createFileRoute("/auth")({
  // Solo cliente: hay que leer el fragmento (#...) del enlace antes de que Supabase lo procese.
  ssr: false,
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Entrar — Handle" },
      { name: "description", content: "Entra a Handle con un enlace a tu correo, registra tu negocio o crea tu cuenta de cliente." },
      { property: "og:title", content: "Entrar — Handle" },
      { property: "og:description", content: "Entra a Handle con un enlace a tu correo, registra tu negocio o crea tu cuenta de cliente." },
    ],
  }),
  component: AuthPage,
});

/** Si el usuario llega desde un enlace vencido, inválido o con la cuenta bloqueada, Supabase manda el error en la URL. */
function leerErrorDelEnlace(): string | null {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const codigo = hash.get("error_code") ?? query.get("error_code");
  const error = hash.get("error") ?? query.get("error");
  if (!codigo && !error) return null;
  window.history.replaceState(null, "", window.location.pathname);
  if (codigo === "otp_expired") return "Ese enlace ya venció o ya se usó. Pide uno nuevo.";
  if (codigo === "user_banned") return MENSAJE_BAJA;
  return "No pudimos validar el enlace. Pide uno nuevo.";
}

/** Al entrar con un correo sin cuenta, Supabase responde con este error. */
function esCorreoSinCuenta(error: AuthError) {
  return error.code === "otp_disabled" || /signups not allowed/i.test(error.message);
}

function mensajeDeError(error: AuthError) {
  const codigo = error.code ?? "";
  const msg = error.message;
  if (codigo === "user_banned" || /banned/i.test(msg)) return MENSAJE_BAJA;
  if (codigo === "over_email_send_rate_limit" || /rate limit|security purposes|too many/i.test(msg)) {
    return "Ya te enviamos un enlace hace poco. Espera un minuto e inténtalo de nuevo.";
  }
  if (codigo === "email_address_not_authorized" || /not authorized/i.test(msg)) {
    return "Por ahora Handle está en modo de pruebas y no puede enviar enlaces a este correo.";
  }
  if (codigo === "email_address_invalid" || /invalid/i.test(msg)) {
    return "Ese correo no es válido. Revisa que esté bien escrito.";
  }
  return "No pudimos enviar el enlace. Intenta de nuevo.";
}

function AuthPage() {
  const navigate = useNavigate();
  const { modo, motivo } = Route.useSearch();
  const [pestana, setPestana] = useState<Modo>(modo ?? "entrar");
  const [tipoCuenta, setTipoCuenta] = useState<TipoCuenta>("negocio");
  const [errorEnlace, setErrorEnlace] = useState<string | null>(
    () => leerErrorDelEnlace() ?? (motivo === "baja" ? MENSAJE_BAJA : null),
  );
  const [enviado, setEnviado] = useState<Enviado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [espera, setEspera] = useState(0);

  // Con sesión (recién llegada del enlace o previa), entra a la pantalla de su rol.
  useEffect(() => {
    let vigente = true;
    async function irAInicio() {
      const { data: auth, error } = await supabase.auth.getUser();
      if (!vigente) return;
      if (error || !auth.user) {
        // Sesión guardada que ya no sirve (cuenta bloqueada, borrada o vencida):
        // se limpia en este dispositivo para no dejar al usuario atorado.
        await supabase.auth.signOut({ scope: "local" });
        if (error && (error.code === "user_banned" || /banned/i.test(error.message))) setErrorEnlace(MENSAJE_BAJA);
        return;
      }
      const { data: perfil } = await supabase.from("profiles").select("role, activo").eq("id", auth.user.id).maybeSingle();
      if (!vigente) return;
      if (perfil && !perfil.activo) {
        await supabase.auth.signOut({ scope: "local" });
        setErrorEnlace(MENSAJE_BAJA);
        return;
      }
      navigate({ to: inicioPorRol(perfil?.role), replace: true });
    }
    // Las llamadas a Supabase no deben hacerse dentro del callback: se difieren un tick.
    const { data } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (sesion && evento !== "SIGNED_OUT") setTimeout(() => void irAInicio(), 0);
    });
    return () => {
      vigente = false;
      data.subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function enviarEnlace(email: string, modoEnvio: Modo, datos?: DatosRegistro) {
    setCargando(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        shouldCreateUser: modoEnvio === "crear",
        ...(datos ? { data: datos } : {}),
      },
    });
    setCargando(false);
    // Para no revelar qué correos tienen cuenta, "entrar" con un correo desconocido
    // muestra la misma pantalla que un envío exitoso.
    if (error && !(modoEnvio === "entrar" && esCorreoSinCuenta(error))) {
      toast.error(mensajeDeError(error));
      return;
    }
    setErrorEnlace(null);
    setEnviado(datos ? { email, modo: modoEnvio, datos } : { email, modo: modoEnvio });
    setEspera(ESPERA_REENVIO);
  }

  function onEntrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void enviarEnlace(String(f.get("email")).trim().toLowerCase(), "entrar");
  }

  function onCrear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const full_name = String(f.get("full_name")).trim();
    // El navegador ya exige la casilla (required); esto cubre envíos sin validación nativa.
    if (f.get("acepta_legal") !== "si") {
      toast.error("Para crear tu cuenta acepta los términos y el aviso de privacidad.");
      return;
    }
    const datos: DatosRegistro =
      tipoCuenta === "negocio"
        ? { full_name, tipo_cuenta: "negocio", org_name: String(f.get("org_name")).trim(), ...metadatosAceptacion() }
        : { full_name, tipo_cuenta: "cliente", ...metadatosAceptacion() };
    void enviarEnlace(String(f.get("email")).trim().toLowerCase(), "crear", datos);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="m-auto w-full max-w-sm py-12">
          {enviado ? (
            <div>
              <div className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
                <Mail className="size-6" />
              </div>
              <h1 className="mt-6 text-2xl font-bold tracking-tight">Revisa tu correo</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Te enviamos un enlace para entrar a <span className="font-medium text-foreground">{enviado.email}</span>.
                Ábrelo en el celular o computadora donde vas a usar Handle. Solo sirve una vez.
              </p>
              {enviado.modo === "entrar" && (
                <p className="mt-3 text-xs text-muted-foreground">
                  ¿No te llega? Revisa tu carpeta de spam. Si todavía no tienes cuenta,{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline underline-offset-2"
                    onClick={() => {
                      setEnviado(null);
                      setPestana("crear");
                    }}
                  >
                    créala aquí
                  </button>
                  .
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setEnviado(null)}>
                  Usar otro correo
                </Button>
                <Button
                  onClick={() => void enviarEnlace(enviado.email, enviado.modo, enviado.datos)}
                  disabled={cargando || espera > 0}
                >
                  {cargando && <Loader2 className="animate-spin" />}
                  {espera > 0 ? `Reenviar en ${espera} s` : "Reenviar enlace"}
                </Button>
              </div>
            </div>
          ) : (
            <Tabs value={pestana} onValueChange={(v) => setPestana(v as Modo)}>
              <h1 className="text-2xl font-bold tracking-tight">Bienvenido a Handle</h1>
              <p className="mb-6 mt-1 text-sm text-muted-foreground">
                Sin contraseñas: te mandamos un enlace a tu correo para entrar.
              </p>
              {errorEnlace && (
                <p
                  role="alert"
                  className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {errorEnlace}
                </p>
              )}
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="entrar">Entrar</TabsTrigger>
                <TabsTrigger value="crear">Crear cuenta</TabsTrigger>
              </TabsList>
              <TabsContent value="entrar">
                <form onSubmit={onEntrar} className="mt-4 space-y-4">
                  <Campo label="Correo electrónico" name="email" type="email" autoComplete="email" placeholder="tucorreo@ejemplo.com" />
                  <Button className="w-full" disabled={cargando}>
                    {cargando && <Loader2 className="animate-spin" />}
                    {cargando ? "Enviando…" : "Enviarme el enlace"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="crear">
                <form onSubmit={onCrear} className="mt-4 space-y-4">
                  <fieldset>
                    <legend className="mb-1.5 text-sm font-medium">¿Para qué quieres Handle?</legend>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup">
                      <OpcionTipo
                        activo={tipoCuenta === "negocio"}
                        onClick={() => setTipoCuenta("negocio")}
                        icono={<Store className="size-4" />}
                        titulo="Tengo un negocio"
                        detalle="Cobrar y premiar"
                      />
                      <OpcionTipo
                        activo={tipoCuenta === "cliente"}
                        onClick={() => setTipoCuenta("cliente")}
                        icono={<ShoppingBag className="size-4" />}
                        titulo="Soy cliente"
                        detalle="Juntar puntos"
                      />
                    </div>
                  </fieldset>
                  <Campo label="Tu nombre" name="full_name" autoComplete="name" placeholder="María López" />
                  {tipoCuenta === "negocio" && (
                    <Campo label="Nombre de tu negocio" name="org_name" autoComplete="organization" placeholder="Abarrotes Doña Mari" />
                  )}
                  <Campo label="Correo electrónico" name="email" type="email" autoComplete="email" placeholder="tucorreo@ejemplo.com" />
                  <div className="flex items-start gap-2">
                    <input
                      id="acepta_legal"
                      name="acepta_legal"
                      type="checkbox"
                      value="si"
                      required
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                    />
                    <Label htmlFor="acepta_legal" className="text-xs font-normal leading-snug text-muted-foreground">
                      <span>
                        Acepto los{" "}
                        <Link to="/terminos" target="_blank" className="font-medium text-foreground underline underline-offset-2">
                          términos de uso
                        </Link>{" "}
                        y el{" "}
                        <Link to="/privacidad" target="_blank" className="font-medium text-foreground underline underline-offset-2">
                          aviso de privacidad
                        </Link>
                        . Entiendo que los puntos son descuentos y no dinero.
                      </span>
                    </Label>
                  </div>
                  <Button className="w-full" disabled={cargando}>
                    {cargando && <Loader2 className="animate-spin" />}
                    {cargando ? "Enviando…" : "Crear mi cuenta"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {tipoCuenta === "negocio"
                      ? "Tu negocio empieza con una Caja y una Cuenta CoDi listas para registrar ventas."
                      : "Usa el mismo correo que das al pagar en tus negocios favoritos para juntar tus puntos."}
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>
        <EnlacesLegales />
      </div>
      <div className="bg-brand-gradient hidden flex-col justify-end gap-8 p-12 text-primary-foreground lg:flex">
        <p className="max-w-md text-3xl font-semibold leading-tight">El cobro de tu changarro, en tu mano.</p>
        <ul className="space-y-4 text-base">
          <li className="flex items-center gap-3">
            <QrCode className="size-5 shrink-0" /> Cobra con CoDi desde tu celular, sin terminal.
          </li>
          <li className="flex items-center gap-3">
            <Gift className="size-5 shrink-0" /> Premia con puntos a tus clientes de confianza.
          </li>
          <li className="flex items-center gap-3">
            <MapPin className="size-5 shrink-0" /> Aparece en el mapa de negocios de tu colonia.
          </li>
        </ul>
      </div>
    </div>
  );
}

function OpcionTipo({
  activo,
  onClick,
  icono,
  titulo,
  detalle,
}: {
  activo: boolean;
  onClick: () => void;
  icono: ReactNode;
  titulo: string;
  detalle: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activo}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
        activo ? "border-primary bg-accent text-accent-foreground" : "bg-background hover:bg-muted",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {icono}
        {titulo}
      </span>
      <span className="text-xs text-muted-foreground">{detalle}</span>
    </button>
  );
}

function Campo({
  label,
  name,
  type = "text",
  autoComplete,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required autoComplete={autoComplete} placeholder={placeholder} />
    </div>
  );
}
