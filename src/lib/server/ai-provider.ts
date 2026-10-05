import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const PROVIDER = process.env.FLASHCARDS_PROVIDER ?? "cloudflare";
export const MODEL = process.env.FLASHCARDS_MODEL ?? (PROVIDER === "anthropic" ? "claude-opus-5" : "@cf/qwen/qwen3-30b-a3b-fp8");
export interface TokenUsage { input: number; output: number }
export class GenerationError extends Error {
  constructor(public code: "credentials" | "quota" | "temporary" | "format" | "refused", message: string, public status = 502) { super(message); }
}
export function generationAvailable(): boolean {
  if (PROVIDER === "cloudflare") return !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
  if (PROVIDER === "anthropic") return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return false;
}
export function cloudflareError(status: number, errors: { code?: number; message?: string }[]): GenerationError {
  const codes = errors.map(e => e.code);
  const message = errors.map(e => e.message ?? "").join(" ");
  if (codes.includes(3036) || /daily free allocation|daily.*quota|neurons.*limit/i.test(message))
    return new GenerationError("quota", "Se agotó la cuota gratuita de Workers AI. Se renueva diariamente a las 00:00 UTC. Tus conjuntos terminados siguen guardados.", 429);
  if (status === 401 || status === 403)
    return new GenerationError("credentials", "Revisa el token, el Account ID y los permisos de Workers AI. Esta cuenta o modelo no está disponible; no se habilitará pago.", 503);
  if (/JSON Mode|response_format|json_schema/i.test(message))
    return new GenerationError("format", "El modelo no pudo utilizar la salida estructurada.");
  return new GenerationError("temporary", status === 429 ? "Workers AI está ocupado o limita temporalmente las solicitudes. Intenta más tarde." : "Workers AI no pudo completar la solicitud. Intenta más tarde.", 503);
}
function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(text);
}

/** At most two attempts, including schema fallback and validation repair. */
export async function structured<T>(options: {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
  onUsage?: (usage: TokenUsage) => void;
  validate?: (value: T) => T;
}): Promise<T> {
  const { schema, system, prompt, maxTokens, signal, onUsage, validate } = options;
  if (!generationAvailable()) throw new GenerationError("credentials", PROVIDER === "anthropic" ? "Configura las credenciales de Anthropic en .env.local." : "Configura CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN en .env.local para generar tarjetas.", 503);
  let repair = "";
  let useSchema = true;
  const jsonSchema = z.toJSONSchema(schema, { unrepresentable: "any" });
  for (let attempt = 0; attempt < 2; attempt++) {
    signal?.throwIfAborted();
    let raw: unknown;
    try {
      if (PROVIDER === "anthropic") {
        const response = await new Anthropic().messages.parse({
          model: MODEL, max_tokens: maxTokens,
          output_config: { effort: options.effort ?? "medium", format: zodOutputFormat(schema) },
          system, messages: [{ role: "user", content: prompt + repair }],
        }, { signal });
        onUsage?.({ input: response.usage.input_tokens, output: response.usage.output_tokens });
        if (response.stop_reason === "refusal") throw new GenerationError("refused", "El proveedor rechazó la generación.", 422);
        raw = response.parsed_output;
      } else {
        let response: Response;
        try {
          response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID!)}/ai/run/${MODEL}`, {
            method: "POST",
            headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
            body: JSON.stringify({
              messages: [
                { role: "system", content: `${system}\nReturn only JSON matching this schema, without markdown or reasoning: ${JSON.stringify(jsonSchema)}` },
                { role: "user", content: prompt + repair },
              ],
              max_tokens: maxTokens, temperature: 0.3,
              ...(useSchema ? { response_format: { type: "json_schema", json_schema: jsonSchema } } : {}),
            }),
            signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(120_000)]),
          });
        } catch (error) {
          if (signal?.aborted) throw error;
          throw new GenerationError("temporary", "No se pudo conectar con Workers AI o la solicitud tardó demasiado.", 503);
        }
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.success === false) throw cloudflareError(response.status, body.errors ?? []);
        const result = body.result;
        const usage = result?.usage;
        if (usage && (typeof usage.prompt_tokens === "number" || typeof usage.input_tokens === "number"))
          onUsage?.({ input: usage.prompt_tokens ?? usage.input_tokens ?? 0, output: usage.completion_tokens ?? usage.output_tokens ?? 0 });
        raw = result?.choices?.[0]?.message?.content ?? result?.response;
      }
      const value = schema.parse(parseJson(raw));
      return validate ? validate(value) : value;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof GenerationError && error.code !== "format") throw error;
      if (attempt === 1) throw new GenerationError("format", "La respuesta no cumplió el formato de tarjetas después de un intento de reparación.");
      if (error instanceof GenerationError) useSchema = false;
      // Never send raw provider errors, credentials or a prior model answer back.
      repair = "\nRepair the previous attempt. Return valid JSON with exactly the requested count, distinct options, unique ids, and valid source references. Follow every constraint.";
    }
  }
  throw new GenerationError("format", "No se pudo generar una respuesta válida.");
}
