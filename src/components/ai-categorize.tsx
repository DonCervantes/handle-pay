import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/form-bits";
import { suggestCategories } from "@/lib/ai.functions";
import { CATEGORIES } from "@/lib/categories";
import { formatMXN } from "@/lib/format";

type Row = { id: string; description: string | null; amount: number; type: string; current: string; suggested: string; accept: boolean };

export function AiCategorize() {
  const suggest = useServerFn(suggestCategories);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [onlyGeneric, setOnlyGeneric] = useState(true);

  async function run(generic = onlyGeneric) {
    setLoading(true);
    setOpen(true);
    try {
      const r = await suggest({ data: { onlyGeneric: generic } });
      if (!r.ok) { toast.error(r.error); setOpen(false); return; }
      setRows(r.data.suggestions.map((s) => ({ ...s, accept: s.suggested !== s.current })));
    } catch {
      toast.error("No se pudieron obtener sugerencias.");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const changes = rows.filter((r) => r.accept && r.suggested !== r.current);
    if (!changes.length) { setOpen(false); return; }
    setSaving(true);
    const results = await Promise.all(changes.map((r) => supabase.from("transactions").update({ category: r.suggested }).eq("id", r.id)));
    setSaving(false);
    if (results.some((r) => r.error)) toast.error("Algunas categorías no se guardaron");
    else toast.success(`${changes.length} categorías actualizadas`);
    qc.invalidateQueries({ queryKey: ["transactions"] });
    setOpen(false);
  }

  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <>
      <Button variant="outline" onClick={() => run()}>
        <Sparkles className="text-gold" /> Sugerir categorías con IA
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sugerencias de categoría</DialogTitle>
            <DialogDescription>Revisa, edita y acepta las categorías propuestas antes de guardar.</DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Analizando transacciones…</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <p>No hay transacciones sin categoría o con categoría genérica.</p>
              {onlyGeneric && (
                <Button variant="link" onClick={() => { setOnlyGeneric(false); run(false); }}>Revisar las 40 más recientes</Button>
              )}
            </div>
          ) : (
            <div className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
              {rows.map((r) => (
                <label key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <input type="checkbox" checked={r.accept} onChange={(e) => set(r.id, { accept: e.target.checked })} className="size-4 accent-[var(--primary)]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.description ?? "Sin descripción"}</p>
                    <p className="text-xs text-muted-foreground">{r.type === "income" ? "Ingreso" : "Egreso"} · {formatMXN(r.amount)} · actual: {r.current}</p>
                  </div>
                  <NativeSelect value={r.suggested} onChange={(e) => set(r.id, { suggested: e.target.value, accept: true })} className="w-40">
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </NativeSelect>
                </label>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={loading || saving || !rows.some((r) => r.accept)}>
              {saving && <Loader2 className="animate-spin" />} Guardar seleccionadas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
