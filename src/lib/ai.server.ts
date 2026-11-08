// Groq (OpenAI-compatible) client + agent_runs logging. Server-only.
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const getGroqModel = () => process.env["GROQ_MODEL"]?.trim() || DEFAULT_GROQ_MODEL;

export class MissingKeyError extends Error {}

type Msg = { role: "system" | "user" | "assistant"; content: string };

const PREFERRED_MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];

export class GroqModelError extends Error {}

/** Lists chat models available for this key (GET /models). Logs status + ids. */
export async function listGroqModels(key: string) {
  const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  const body = await res.text();
  if (!res.ok) {
    console.error(`[groq] GET /models -> ${res.status}: ${body}`);
    if (res.status === 401) throw new Error("La clave de Groq (GROQ_API_KEY) no es válida. Revísala en los secretos del proyecto.");
    throw new Error(`No pudimos consultar los modelos de Groq (error ${res.status}).`);
  }
  const ids = ((JSON.parse(body) as { data?: { id: string }[] }).data ?? []).map((m) => m.id);
  console.log(`[groq] GET /models -> ${res.status}; modelos disponibles: ${ids.join(", ")}`);
  return ids.filter((id) => !/whisper|orpheus|guard|safeguard|tts/i.test(id));
}

function pickModel(available: string[]) {
  return PREFERRED_MODELS.find((m) => available.includes(m)) ?? available[0];
}

async function callChat(key: string, model: string, messages: Msg[], opts: { json?: boolean; temperature?: number }) {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
}

export async function groqChat(messages: Msg[], opts: { json?: boolean; temperature?: number } = {}) {
  const key = process.env["GROQ_API_KEY"]?.trim();
  if (!key) throw new MissingKeyError("Falta configurar la clave de Groq (GROQ_API_KEY). Agrégala en los secretos del proyecto para activar la IA.");
  let model = getGroqModel();
  let res = await callChat(key, model, messages, opts);
  if (res.status === 404) {
    // Model not available for this key: log the real error, then fall back to a model that exists.
    console.error(`[groq] chat 404 model=${model}: ${await res.text()}`);
    const available = await listGroqModels(key);
    const fallback = pickModel(available);
    if (!fallback || fallback === model) {
      throw new GroqModelError(`El modelo de IA configurado (${model}) no está disponible para esta clave de Groq.`);
    }
    console.warn(`[groq] usando modelo alterno ${fallback}`);
    model = fallback;
    res = await callChat(key, model, messages, opts);
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`[groq] chat error ${res.status} model=${model}: ${body}`);
    let detail = body.slice(0, 300);
    try { detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? detail; } catch {}
    if (res.status === 401) throw new Error("La clave de Groq (GROQ_API_KEY) no es válida. Revísala en los secretos del proyecto.");
    if (res.status === 404) throw new GroqModelError(`El modelo de IA configurado (${model}) no está disponible.`);
    if (res.status === 429) throw new Error("Groq está limitando las solicitudes. Intenta en unos segundos.");
    throw new Error(`Groq respondió con error ${res.status} (modelo ${model}): ${detail}`);
  }
  const json = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { total_tokens?: number } };
  return { content: json.choices[0]?.message?.content ?? "", tokens: json.usage?.total_tokens ?? null, model };
}

/** Runs an agent call and records it in agent_runs (org_id filled by trigger). */
export async function runAgent<T>(
  supabase: any,
  agent: string,
  input: unknown,
  fn: () => Promise<{ output: T; tokens: number | null }>,
) {
  const start = Date.now();
  try {
    const r = await fn();
    await supabase.from("agent_runs").insert({ agent, input, output: r.output as never, tokens: r.tokens, latency_ms: Date.now() - start });
    return r.output;
  } catch (e) {
    if (!(e instanceof MissingKeyError)) {
      await supabase.from("agent_runs").insert({ agent, input, output: { error: e instanceof Error ? e.message : String(e) }, latency_ms: Date.now() - start });
    }
    throw e;
  }
}
