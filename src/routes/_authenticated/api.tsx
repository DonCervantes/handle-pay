import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Play, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createApiKey, revokeApiKey } from "@/lib/api-keys.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageMeta } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/api")({
  head: () => pageMeta("API para desarrolladores", "Integra Handle en tus flujos con la Handle API v1."),
  component: ApiPage,
});

const keysQuery = {
  queryKey: ["api_keys"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "—";

function ApiPage() {
  const qc = useQueryClient();
  const { data: keys = [], isLoading } = useQuery(keysQuery);
  const createFn = useServerFn(createApiKey);
  const revokeFn = useServerFn(revokeApiKey);
  const [newOpen, setNewOpen] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://tu-dominio";

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await createFn({ data: { name: String(new FormData(e.currentTarget).get("name")) } });
      setNewOpen(false);
      setCreated(r.key);
      setLastKey(r.key);
      qc.invalidateQueries({ queryKey: ["api_keys"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos crear la API key.");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    try {
      await revokeFn({ data: { id } });
      toast.success("API key revocada");
      qc.invalidateQueries({ queryKey: ["api_keys"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos revocarla.");
    }
  }

  async function tryLive() {
    if (!lastKey) return;
    setLive("Cargando…");
    const res = await fetch("/api/v1/transactions?limit=5", { headers: { Authorization: `Bearer ${lastKey}` } });
    setLive(`HTTP ${res.status}\n` + JSON.stringify(await res.json(), null, 2));
  }

  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copiado"));

  const endpoints = [
    { method: "GET", path: "/api/v1/transactions", desc: "Lista ingresos y egresos de tu organización. Parámetros: limit (1–200), type (income|expense).", status: "Disponible",
      curl: `curl ${origin}/api/v1/transactions?limit=10 \\\n  -H "Authorization: Bearer hdl_live_..."` },
    { method: "POST", path: "/api/v1/payments", desc: "Crea una orden de pago a proveedor (borrador).", status: "Próximamente",
      curl: `curl -X POST ${origin}/api/v1/payments \\\n  -H "Authorization: Bearer hdl_live_..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"supplier_id":"<uuid>","amount_fiat":1500}'` },
    { method: "GET", path: "/api/v1/clients", desc: "Lista los clientes de tu CRM con estado y saldo.", status: "Próximamente",
      curl: `curl ${origin}/api/v1/clients \\\n  -H "Authorization: Bearer hdl_live_..."` },
  ];

  return (
    <>
      <PageHeader
        title="API para desarrolladores"
        description="Conecta Handle con tu ERP, e-commerce o automatizaciones mediante la Handle API v1."
        actions={<Button onClick={() => setNewOpen(true)}><Plus /> Generar nueva API key</Button>}
      />

      <Card className="mb-8 shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-4 text-gold" /> API keys</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Nombre</TableHead><TableHead>Clave</TableHead><TableHead>Creada</TableHead><TableHead>Último uso</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : keys.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">Aún no tienes API keys. Genera la primera.</TableCell></TableRow>
              ) : keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs">{k.key_prefix}…</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(k.created_at)}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(k.last_used_at)}</TableCell>
                  <TableCell>{k.revoked_at ? <Badge variant="outline">Revocada</Badge> : <Badge>Activa</Badge>}</TableCell>
                  <TableCell className="text-right">
                    {!k.revoked_at && <Button size="sm" variant="outline" onClick={() => onRevoke(k.id)}>Revocar</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <h2 className="mb-1 text-lg font-bold">Handle API v1</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Autentica cada solicitud con el encabezado <code className="font-mono">Authorization: Bearer hdl_live_...</code>. Las respuestas son JSON.
      </p>
      <div className="grid gap-4">
        {endpoints.map((e) => (
          <Card key={e.path} className="shadow-card">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono">{e.method}</Badge>
                <code className="font-mono text-sm font-medium">{e.path}</code>
                <Badge variant={e.status === "Disponible" ? "default" : "secondary"} className="ml-auto">{e.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{e.desc}</p>
              <div className="relative">
                <pre className="overflow-x-auto rounded-md bg-muted p-3 pr-10 font-mono text-xs">{e.curl}</pre>
                <Button size="icon" variant="ghost" className="absolute right-1 top-1 size-7" aria-label="Copiar" onClick={() => copy(e.curl)}><Copy /></Button>
              </div>
              {e.status === "Disponible" && (
                <div className="space-y-2">
                  <Button size="sm" variant="outline" onClick={tryLive} disabled={!lastKey}>
                    <Play /> Probar en vivo
                  </Button>
                  {!lastKey && <p className="text-xs text-muted-foreground">Genera una API key para probar este endpoint.</p>}
                  {live && <pre className="max-h-80 overflow-auto rounded-md border bg-card p-3 font-mono text-xs">{live}</pre>}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <form onSubmit={onCreate} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Nueva API key</DialogTitle>
              <DialogDescription>Ponle un nombre para identificar dónde la usarás.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" placeholder="Ej. Integración tienda en línea" required maxLength={80} />
            </div>
            <DialogFooter><Button disabled={busy}>{busy ? "Generando…" : "Generar"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copia tu API key</DialogTitle>
            <DialogDescription>Solo la mostraremos esta vez. Guárdala en un lugar seguro.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-muted p-3 font-mono text-xs">{created}</code>
            <Button size="icon" variant="outline" aria-label="Copiar" onClick={() => created && copy(created)}><Copy /></Button>
          </div>
          <DialogFooter><Button onClick={() => setCreated(null)}>Listo</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
