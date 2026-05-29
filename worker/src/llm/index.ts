// worker/src/llm/index.ts
// Unified LLM interface: Cloudflare Workers AI (default) + Gemini API (BYOK).
// Agents call chat() or streamChat() — never vendor SDKs directly.

import type { LlmConfig, ChatMessage } from '../pipeline/types';

// ── Default models ────────────────────────────────────────────────────────────

// Fast 8B model for structured-JSON agents (contract, mapper, evaluator, defender)
export const FAST_MODEL_WORKERSAI  = '@cf/meta/llama-3.1-8b-instruct';
// High-quality 70B model for the Perturber (the voice of the machine)
export const QUALITY_MODEL_WORKERSAI = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
// Gemini default for all agents
export const DEFAULT_MODEL_GEMINI  = 'gemini-2.0-flash';

// ── chat() — returns full response string ─────────────────────────────────────

export async function chat(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: { formatJson?: boolean; temperature?: number },
): Promise<string> {
  if (config.provider === 'gemini') {
    return chatGemini(config, messages, options);
  }
  return chatWorkersAI(config, messages, options);
}

// ── streamChat() — returns ReadableStream of text tokens ─────────────────────

export async function streamChat(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: { temperature?: number },
): Promise<ReadableStream<string>> {
  if (config.provider === 'gemini') {
    return streamGemini(config, messages, options);
  }
  return streamWorkersAI(config, messages, options);
}

// ── Workers AI ────────────────────────────────────────────────────────────────

async function chatWorkersAI(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: { formatJson?: boolean; temperature?: number },
): Promise<string> {
  const model = config.model || QUALITY_MODEL_WORKERSAI;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inputs: Record<string, any> = {
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: 1024,
  };
  if (options?.formatJson) {
    inputs['response_format'] = { type: 'json_object' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (config.ai as any).run(model, inputs) as { response: string };
  return result.response ?? '';
}

async function streamWorkersAI(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: { temperature?: number },
): Promise<ReadableStream<string>> {
  const model = config.model || QUALITY_MODEL_WORKERSAI;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawStream = await (config.ai as any).run(model, {
    messages,
    temperature: options?.temperature ?? 0.72,
    stream: true,
  }) as ReadableStream<Uint8Array>;

  // Transform Workers AI SSE stream → plain text token stream
  const decoder  = new TextDecoder();
  let   leftover = '';

  return rawStream.pipeThrough(
    new TransformStream<Uint8Array, string>({
      transform(chunk, controller) {
        const text  = leftover + decoder.decode(chunk, { stream: true });
        const lines = text.split('\n');
        leftover    = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload) as { response?: string };
            if (json.response) controller.enqueue(json.response);
          } catch {
            // malformed chunk — skip
          }
        }
      },
      flush(controller) {
        // Process any remaining buffered data
        if (leftover.startsWith('data: ')) {
          const payload = leftover.slice(6).trim();
          if (payload && payload !== '[DONE]') {
            try {
              const json = JSON.parse(payload) as { response?: string };
              if (json.response) controller.enqueue(json.response);
            } catch { /* ignore */ }
          }
        }
      },
    }),
  );
}

// ── Gemini API ────────────────────────────────────────────────────────────────

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function buildGeminiBody(
  messages: ChatMessage[],
  options?: { formatJson?: boolean; temperature?: number },
) {
  const systemParts = messages.filter(m => m.role === 'system').map(m => m.content);
  const chatMsgs    = messages.filter(m => m.role !== 'system');

  return {
    system_instruction: systemParts.length ? { parts: [{ text: systemParts.join('\n\n') }] } : undefined,
    contents: chatMsgs.map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature:      options?.temperature ?? 0.7,
      maxOutputTokens:  1024,
      responseMimeType: options?.formatJson ? 'application/json' : 'text/plain',
    },
  };
}

async function chatGemini(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: { formatJson?: boolean; temperature?: number },
): Promise<string> {
  if (!config.apiKey) throw new Error('Gemini API key is required. Set it in the LLM panel.');

  const model    = config.model || DEFAULT_MODEL_GEMINI;
  const endpoint = `${GEMINI_BASE}/${model}:generateContent?key=${config.apiKey}`;
  const body     = buildGeminiBody(messages, options);

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function streamGemini(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: { temperature?: number },
): Promise<ReadableStream<string>> {
  if (!config.apiKey) throw new Error('Gemini API key is required for streaming.');

  const model    = config.model || DEFAULT_MODEL_GEMINI;
  const endpoint = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;
  const body     = buildGeminiBody(messages, options);

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok || !res.body) throw new Error(`Gemini stream error ${res.status}`);

  const decoder  = new TextDecoder();
  let   leftover = '';

  return res.body.pipeThrough(
    new TransformStream<Uint8Array, string>({
      transform(chunk, controller) {
        const text  = leftover + decoder.decode(chunk, { stream: true });
        const lines = text.split('\n');
        leftover    = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const json = JSON.parse(payload) as any;
            const token = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (token) controller.enqueue(token);
          } catch { /* skip malformed */ }
        }
      },
    }),
  );
}

// ── Model listing (for UI model picker) ───────────────────────────────────────

export const WORKERSAI_MODELS = [
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B (Fast)' },
  { id: '@cf/meta/llama-3.1-8b-instruct',           label: 'Llama 3.1 8B' },
  { id: '@cf/google/gemma-3-12b-it',                label: 'Gemma 3 12B' },
  { id: '@cf/mistral/mistral-7b-instruct-v0.2',     label: 'Mistral 7B' },
] as const;

export const GEMINI_MODELS = [
  { id: 'gemini-2.0-flash',   label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.5-pro',     label: 'Gemini 2.5 Pro' },
  { id: 'gemini-1.5-flash',   label: 'Gemini 1.5 Flash' },
] as const;
