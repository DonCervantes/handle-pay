import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Bot, Loader2, UserPlus, Workflow } from "lucide-react";
import { toast } from "sonner";
import type React from "react";
import { getIntegrationsStatus } from "@/lib/ai.functions";
import { agregarMiembro, cambiarEstadoMiembro } from "@/lib/equipo.functions";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { TableFeedback } from "@/components/table-feedback";
import { FormField, NativeSelect } from "@/components/form-bits";
import { meQuery } from "@/lib/session";
import { roleLabels } from "@/lib/format";
import { pageMeta } from "@/lib/metadata";
import { ROLES_GERENCIA, tieneRol, type RolDeEquipo } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/configuracion")({
  head: () =>
    pageMeta("Configuración", "Datos de tu organización, equipo e integraciones de Handle."),
  component: Configuracion,
});

// RLS solo devuelve los perfiles de la propia organización.
const equipoQuery = queryOptions({
  queryKey: ["equipo"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, activo, created_at")
      .not("org_id", "is", null)
      .order("created_at");
    if (error) throw error;
    return data;
  },
});

const mensaje = (e: unknown) =>
  e instanceof Error ? e.message : "Algo salió mal. Intenta de nuevo.";

function Configuracion() {
  const { data: me } = useQuery(meQuery);
  const statusFn = useServerFn(getIntegrationsStatus);
  const esGerencia = tieneRol(me?.role, ROLES_GERENCIA);
  // Las integraciones solo le sirven a quien administra el negocio.
  const { data: st } = useQuery({
    queryKey: ["integrations-status"],
    queryFn: () => statusFn(),
    enabled: esGerencia,
  });
  const rows = [
    ["Organización", me?.organizations?.name],
    ["País", me?.organizations?.country],
    ["Moneda", me?.organizations?.currency_default],
    ["Tu rol", roleLabels[me?.role ?? ""]],
  ];
  return (
    <>
      <PageHeader title="Configuración" description="Ajustes de tu organización y equipo." />
      <Card className="max-w-xl shadow-card">
        <CardContent className="divide-y p-0">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 px-6 py-4 text-sm">
              <span className="text-muted-foreground">{k}</span>
              <span className="break-words text-right font-medium">{v ?? "—"}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {esGerencia && me && <Equipo miId={me.id} />}

      {esGerencia && (
        <>
          <h2 className="mb-3 mt-10 text-lg font-bold tracking-tight">Integraciones</h2>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <IntegrationCard
              icon={<Bot className="size-5" />}
              title="Inteligencia artificial (Groq)"
              active={st?.groq.configured}
              detail={st ? `Modelo: ${st.groq.model}` : "…"}
              hint="Asistente y sugerencias de categorías en Gastos y cuentas."
              missing="Agrega el secreto GROQ_API_KEY para activarla."
            />
            <IntegrationCard
              icon={<Workflow className="size-5" />}
              title="Automatización (n8n)"
              active={st?.n8n.configured}
              detail={st ? `Eventos: ${st.n8n.events.join(", ")}` : "…"}
              hint="Al confirmarse un pago a proveedor se envía un aviso a tu flujo de n8n."
              missing="Agrega el secreto N8N_WEBHOOK_URL para activarla. Los pagos funcionan igual sin ella."
            />
          </div>
        </>
      )}
    </>
  );
}

function Equipo({ miId }: { miId: string }) {
  const q = useQuery(equipoQuery);
  const qc = useQueryClient();
  const cambiarFn = useServerFn(cambiarEstadoMiembro);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function cambiar(userId: string, activo: boolean) {
    setOcupado(userId);
    try {
      await cambiarFn({ data: { userId, activo } });
      toast.success(activo ? "Acceso reactivado" : "Acceso dado de baja");
      await qc.invalidateQueries({ queryKey: ["equipo"] });
    } catch (e) {
      toast.error(mensaje(e));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="mt-10 max-w-3xl">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Equipo</h2>
          <p className="text-sm text-muted-foreground">
            Quién puede entrar a tu negocio y qué puede hacer.
          </p>
        </div>
        <AgregarMiembro />
      </div>
      <Card className="shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-36" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableFeedback
              cols={4}
              loading={q.isPending}
              error={q.error}
              retry={() => q.refetch()}
            />
            {(q.data ?? []).map((p) => {
              const editable = p.id !== miId && p.role !== "owner";
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="font-medium">
                      {p.full_name ?? "Sin nombre"}
                      {p.id === miId && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">(tú)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.email ?? "—"}</p>
                  </TableCell>
                  <TableCell>{roleLabels[p.role] ?? p.role}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.activo ? "activo" : "baja"} />
                  </TableCell>
                  <TableCell className="text-right">
                    {editable &&
                      (p.activo ? (
                        <ConfirmarBaja
                          nombre={p.full_name ?? p.email ?? "esta persona"}
                          pendiente={ocupado === p.id}
                          onConfirmar={() => cambiar(p.id, false)}
                        />
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={ocupado === p.id}
                          onClick={() => void cambiar(p.id, true)}
                        >
                          {ocupado === p.id && <Loader2 className="animate-spin" />} Reactivar
                        </Button>
                      ))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}

function AgregarMiembro() {
  const [abierto, setAbierto] = useState(false);
  const qc = useQueryClient();
  const agregarFn = useServerFn(agregarMiembro);
  const m = useMutation({
    mutationFn: (f: FormData) =>
      agregarFn({
        data: {
          nombre: String(f.get("nombre")),
          email: String(f.get("email")),
          rol: String(f.get("rol")) as RolDeEquipo,
        },
      }),
    onSuccess: (_r, f) => {
      void qc.invalidateQueries({ queryKey: ["equipo"] });
      toast.success(`${String(f.get("nombre"))} ya es parte de tu equipo`, {
        description: "Pídele que entre a Handle con su correo; le llegará un enlace para acceder.",
      });
      setAbierto(false);
    },
    onError: (e) => toast.error(mensaje(e)),
  });
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    m.mutate(new FormData(e.currentTarget));
  };
  return (
    <Dialog open={abierto} onOpenChange={(v) => !m.isPending && setAbierto(v)}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Agregar al equipo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar al equipo</DialogTitle>
          <DialogDescription>
            No mandamos invitación: la persona entra a Handle con este correo y recibe su enlace de
            acceso.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          <FormField label="Nombre" htmlFor="miembro-nombre">
            <Input
              id="miembro-nombre"
              name="nombre"
              required
              maxLength={120}
              placeholder="Pepe Hernández"
            />
          </FormField>
          <FormField label="Correo electrónico" htmlFor="miembro-email">
            <Input
              id="miembro-email"
              name="email"
              type="email"
              required
              placeholder="pepe@ejemplo.com"
            />
          </FormField>
          <FormField label="Rol" htmlFor="miembro-rol">
            <NativeSelect id="miembro-rol" name="rol" defaultValue="cajero">
              <option value="cajero">Cajero — cobra y canjea puntos; no ve finanzas</option>
              <option value="admin">Administrador — gestiona todo el negocio</option>
            </NativeSelect>
          </FormField>
          <DialogFooter>
            <Button disabled={m.isPending}>
              {m.isPending && <Loader2 className="animate-spin" />} Agregar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmarBaja({
  nombre,
  pendiente,
  onConfirmar,
}: {
  nombre: string;
  pendiente: boolean;
  onConfirmar: () => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={(v) => !pendiente && setAbierto(v)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
          Dar de baja
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Dar de baja a {nombre}?</DialogTitle>
          <DialogDescription>
            Dejará de poder entrar a Handle de inmediato. Su historial (por ejemplo, los cobros que
            hizo) se conserva y puedes reactivarlo cuando quieras.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={pendiente} onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={pendiente}
            onClick={async () => {
              await onConfirmar();
              setAbierto(false);
            }}
          >
            {pendiente && <Loader2 className="animate-spin" />} Dar de baja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationCard({
  icon,
  title,
  active,
  detail,
  hint,
  missing,
}: {
  icon: React.ReactNode;
  title: string;
  active?: boolean | undefined;
  detail: string;
  hint: string;
  missing: string;
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
            {icon}
          </span>
          <p className="min-w-0 break-words font-semibold">{title}</p>
          <span className="col-span-2">
            {active === undefined ? null : <StatusBadge status={active ? "activa" : "inactiva"} />}
          </span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{hint}</p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{detail}</p>
        {active === false && <p className="mt-2 text-xs text-warning">{missing}</p>}
      </CardContent>
    </Card>
  );
}
