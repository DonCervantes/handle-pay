import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, type FormEvent } from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { askFinanceAssistant } from "@/lib/ai.functions";

type Msg = { role: "user" | "assistant"; content: string; error?: boolean };

const SUGGESTIONS = ["¿Cómo va mi flujo de caja este mes?", "¿Cuánto llevo en egresos?", "¿En qué categoría gasto más?"];

export function FinanceAssistant() {
  const ask = useServerFn(askFinanceAssistant);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(question: string) {
    if (!question.trim() || loading) return;
    const history = msgs.filter((m) => !m.error).slice(-6).map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setQ("");
    setLoading(true);
    try {
      const r = await ask({ data: { question, history } });
      setMsgs((m) => [...m, r.ok ? { role: "assistant", content: r.data.answer } : { role: "assistant", content: r.error, error: true }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "No pude responder ahora. Intenta de nuevo.", error: true }]);
    } finally {
      setLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  }
  const onSubmit = (e: FormEvent) => { e.preventDefault(); send(q); };

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <Sparkles className="size-4 text-gold" />
        <CardTitle className="text-base">Asistente financiero</CardTitle>
        <span className="ml-auto text-xs text-muted-foreground">Responde con los datos de tu empresa</span>
      </CardHeader>
      <CardContent>
        <div className="max-h-80 space-y-3 overflow-y-auto">
          {msgs.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-gold hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
                    : m.error
                      ? "max-w-[85%] rounded-2xl rounded-bl-sm border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive"
                      : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-background px-4 py-2 text-sm leading-relaxed"
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Analizando tus finanzas…</div>
          )}
          <div ref={endRef} />
        </div>
        <form onSubmit={onSubmit} className="mt-4 flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pregunta sobre tus ingresos, egresos o saldos…" maxLength={1000} className="bg-background" />
          <Button size="icon" disabled={loading || !q.trim()} aria-label="Enviar"><ArrowUp /></Button>
        </form>
      </CardContent>
    </Card>
  );
}
