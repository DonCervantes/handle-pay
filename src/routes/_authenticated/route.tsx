import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Banknote,
  Send,
  Users,
  UserCog,
  Settings,
  LogOut,
  Moon,
  Sun,
  Menu,
  Code2,
  QrCode,
  Gift,
  ShieldCheck,
  Store,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { meQuery } from "@/lib/session";
import { roleLabels } from "@/lib/format";
import { inicioPorRol, marcoPorRol, puedeEntrar } from "@/lib/roles";
import { toggleTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (!data.user) {
      // Si la cuenta fue dada de baja, Supabase responde user_banned y borra la sesión:
      // se pasa el motivo para que /auth lo explique.
      const dadoDeBaja = error?.code === "user_banned" || /banned/i.test(error?.message ?? "");
      throw redirect({ to: "/auth", search: dadoDeBaja ? { motivo: "baja" } : {} });
    }

    // Perfil desde la caché; se vuelve a pedir si la caché es de otro usuario.
    let me = await context.queryClient.ensureQueryData(meQuery);
    if (me.id !== data.user.id) me = await context.queryClient.fetchQuery(meQuery);

    if (!me.activo) {
      await supabase.auth.signOut({ scope: "local" });
      context.queryClient.clear();
      throw redirect({ to: "/auth", search: { motivo: "baja" } });
    }

    // Cada rol solo abre sus secciones; lo demás lo regresa a su pantalla de inicio.
    if (!puedeEntrar(me.role, location.pathname)) {
      throw redirect({ to: inicioPorRol(me.role), replace: true });
    }
  },
  component: AppShell,
});

type Me = NonNullable<ReturnType<typeof useMe>>;

function useMe() {
  return useQuery(meQuery).data;
}

/** Cajero y cliente ven un marco simple para celular; el resto, el de oficina. */
function AppShell() {
  const me = useMe();
  if (!me) return null; // la guarda ya cargó el perfil; esto solo cubre un instante
  return marcoPorRol(me.role) === "simple" ? <MarcoSimple me={me} /> : <MarcoOficina me={me} />;
}

// =============================================================================
// Piezas compartidas
// =============================================================================

function useCerrarSesion() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return async function cerrarSesion() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}

function iniciales(me: Me) {
  return (me.full_name ?? me.email ?? "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Nombre del negocio en el encabezado; el cliente no tiene negocio. */
function tituloEncabezado(me: Me) {
  return me.organizations?.name ?? (me.role === "cliente" ? "Mi cuenta" : "…");
}

function BotonTema({ grande = false }: { grande?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(grande && "size-11")}
      onClick={toggleTheme}
      aria-label="Cambiar tema"
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}

function MenuCuenta({ me, grande = false }: { me: Me; grande?: boolean }) {
  const navigate = useNavigate();
  const cerrarSesion = useCerrarSesion();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "rounded-full bg-accent text-xs font-semibold text-accent-foreground",
            grande && "size-11 text-sm",
          )}
          aria-label="Cuenta"
        >
          {iniciales(me)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="truncate">{me.full_name}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{me.email}</p>
          <p className="mt-1 text-xs font-normal text-gold">{roleLabels[me.role] ?? me.role}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {puedeEntrar(me.role, "/configuracion") && (
          <DropdownMenuItem
            className={cn(grande && "py-2.5")}
            onClick={() => navigate({ to: "/configuracion" })}
          >
            <Settings /> Configuración
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className={cn(grande && "py-2.5")} onClick={cerrarSesion}>
          <LogOut /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// =============================================================================
// Marco de oficina: menú lateral (cajón en celular), pensado para computadora
// =============================================================================

const navOficina = [
  { to: "/negocio", label: "Mi negocio", icon: Store },
  { to: "/caja", label: "Caja", icon: QrCode },
  { to: "/red", label: "Red Handle", icon: ShieldCheck },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/finanzas", label: "Finanzas", icon: Banknote },
  { to: "/pagos", label: "Pagos a proveedores", icon: Send },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/colaboradores", label: "Colaboradores", icon: UserCog },
  { to: "/api", label: "API", icon: Code2 },
] as const;

/** Menú lateral: solo muestra lo que el rol puede abrir (misma regla que la guarda de rutas). */
function NavLinks({ rol, onNavigate }: { rol: string; onNavigate?: () => void }) {
  const linkCls =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
  const active = {
    className:
      "bg-sidebar-accent font-semibold text-sidebar-accent-foreground [&>svg]:text-sidebar-primary",
  };
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {navOficina
        .filter((n) => puedeEntrar(rol, n.to))
        .map((n) => (
          <Link key={n.to} to={n.to} className={linkCls} activeProps={active} onClick={onNavigate}>
            <n.icon className="size-4" />
            {n.label}
          </Link>
        ))}
      {puedeEntrar(rol, "/configuracion") && (
        <div className="mt-auto">
          <Link to="/configuracion" className={linkCls} activeProps={active} onClick={onNavigate}>
            <Settings className="size-4" />
            Configuración
          </Link>
        </div>
      )}
    </nav>
  );
}

function MarcoOficina({ me }: { me: Me }) {
  const [abierto, setAbierto] = useState(false);
  const qc = useQueryClient();

  // Tiempo real: refresca listas cuando cambian pagos, movimientos o saldos.
  useEffect(() => {
    const ch = supabase.channel(`org-live-${Math.random().toString(36).slice(2)}`);
    for (const table of ["payments", "transactions", "accounts"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table }, () =>
        qc.invalidateQueries({ queryKey: [table] }),
      );
    }
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-sidebar px-4 py-6 md:flex">
        <div className="mb-10 px-2 pt-1">
          <Logo className="h-8" />
        </div>
        <NavLinks rol={me.role} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-20 flex h-[4.5rem] items-center gap-2 border-b bg-background/80 px-3 backdrop-blur sm:gap-3 sm:px-8">
          <Sheet open={abierto} onOpenChange={setAbierto}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-64 flex-col bg-sidebar p-4">
              <SheetTitle className="sr-only">Menú de navegación Handle</SheetTitle>
              <div className="mb-6 px-2 pt-2">
                <Logo />
              </div>
              <NavLinks rol={me.role} onNavigate={() => setAbierto(false)} />
            </SheetContent>
          </Sheet>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{tituloEncabezado(me)}</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <BotonTema />
            <MenuCuenta me={me} />
            <span className="mx-3 hidden h-8 w-px bg-border sm:block" aria-hidden />
            <Logo className="h-7 shrink-0 pl-1 sm:h-9" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// =============================================================================
// Marco simple (cajero y cliente): pensado para celular, botones grandes al
// alcance del pulgar, sin menú lateral ni nada del ERP.
// =============================================================================

const navSimple = [
  { to: "/caja", label: "Caja", icon: QrCode },
  { to: "/monedero", label: "Mis puntos", icon: Gift },
  { to: "/configuracion", label: "Ajustes", icon: Settings },
] as const;

function MarcoSimple({ me }: { me: Me }) {
  const secciones = navSimple.filter((n) => puedeEntrar(me.role, n.to));
  // Con una sola sección no hace falta barra inferior.
  const conBarra = secciones.length > 1;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
        <Logo className="h-7 shrink-0" />
        <p className="min-w-0 truncate text-base font-semibold">{tituloEncabezado(me)}</p>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <BotonTema grande />
          <MenuCuenta me={me} grande />
        </div>
      </header>

      <main
        className={cn("mx-auto w-full max-w-xl flex-1 px-4 pt-6", conBarra ? "pb-28" : "pb-10")}
      >
        <Outlet />
      </main>

      {conBarra && (
        <nav
          aria-label="Secciones"
          className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        >
          <ul
            className="mx-auto grid max-w-xl"
            style={{ gridTemplateColumns: `repeat(${secciones.length}, minmax(0, 1fr))` }}
          >
            {secciones.map((s) => (
              <li key={s.to}>
                <Link
                  to={s.to}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition-colors"
                  activeProps={{ className: "text-foreground [&>span:first-child]:bg-accent" }}
                >
                  <span className="grid h-8 w-14 place-items-center rounded-full transition-colors">
                    <s.icon className="size-6" />
                  </span>
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
