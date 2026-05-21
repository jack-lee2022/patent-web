/**
 * POST /api/generate-keywords
 * Generates patent search keywords via Oracle VM backend API.
 *
 * Requires ORACLE_VM_URL env var pointing to the backend API.
 * Example: https://patent-api.yourdomain.com or http://104.28.163.97:8000
 *
 * If ORACLE_VM_URL is not set, falls back to direct LLM call using
 * NVIDIA_API_KEY / OPENROUTER_API_KEY / OPENAI_API_KEY.
 */

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";

function getLLMConfig(env) {
  if (env.NVIDIA_API_KEY) {
    return { apiKey: env.NVIDIA_API_KEY, baseUrl: NIM_BASE_URL, model: env.LLM_MODEL || DEFAULT_MODEL };
  }
  if (env.OPENROUTER_API_KEY) {
    return { apiKey: env.OPENROUTER_API_KEY, baseUrl: "https://openrouter.ai/api/v1", model: env.LLM_MODEL || "openai/gpt-4o-mini" };
  }
  if (env.OPENAI_API_KEY) {
    return { apiKey: env.OPENAI_API_KEY, baseUrl: "https://api.openai.com/v1", model: env.LLM_MODEL || "gpt-4o-mini" };
  }
  return null;
}

async function callLLM(config, prompt) {
  const resp = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://patent-web.pages.dev",
      "X-Title": "Patent Analysis Agent",
    },
    body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 800 }),
  });
  if (!resp.ok) throw new Error(`LLM API error ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

function extractJSON(text) {
  if (!text) return null;
  text = text.trim();
  try { return JSON.parse(text); } catch { /* noop */ }
  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) { try { return JSON.parse(codeMatch[1].trim()); } catch { /* noop */ } }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) { try { return JSON.parse(braceMatch[0]); } catch { /* noop */ } }
  const bracketMatch = text.match(/\[[\s\S]*\]/);
  if (bracketMatch) { try { return JSON.parse(bracketMatch[0]); } catch { /* noop */ } }
  return null;
}

async function generateViaOracleVM(vmUrl, body) {
  const resp = await fetch(`${vmUrl}/api/generate-keywords`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`VM returned ${resp.status}: ${text.substring(0, 200)}`);
  }
  return await resp.json();
}

async function generateViaLLM(config, topic, keywords) {
  const prompt = `You are a patent search expert specializing in generating effective Google Patents search queries.

Based on the following technology topic and additional keywords/context, generate patent search keywords.

Technology Topic: ${topic}
Additional Context: ${keywords || "None"}

Requirements:
1. Generate 6-10 English patent search queries (2-4 words each) focused on technical terminology commonly used in patent documents.
2. Also extract any company names, brand names, or product identifiers mentioned.
3. Output ONLY a valid JSON object with this exact structure:

{ "keywords": ["query1", "query2", ...], "entities": ["Company1", ...] }

Rules:
- keywords: Technical search terms for Google Patents q= parameter
- entities: Company/brand/product names for assignee-specific searches (may be empty if none)
- Do NOT include markdown formatting, explanations, or any text outside the JSON.
- If the topic is in Chinese/Japanese, translate concepts to English patent terminology.`;

  const raw = await callLLM(config, prompt);
  const parsed = extractJSON(raw);
  if (!parsed) {
    const lines = raw.split("\n").map(l => l.replace(/^[-*•\d.\s]+/, "").trim()).filter(l => l.length > 2 && l.length < 60);
    return { keywords: lines.slice(0, 10), entities: [], raw: raw.substring(0, 500), warning: "LLM response was not valid JSON; extracted keywords heuristically" };
  }

  const cleanKeywords = [...new Set((parsed.keywords || []).map(k => String(k).trim()).filter(k => k.length > 1))];
  const cleanEntities = [...new Set((parsed.entities || []).map(e => String(e).trim()).filter(e => e.length > 1))];
  return { keywords: cleanKeywords, entities: cleanEntities, model: config.model };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const topic = (body.topic || "").trim();
  const keywords = (body.keywords || "").trim();

  if (!topic) {
    return new Response(JSON.stringify({ error: "Topic is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const vmUrl = env.ORACLE_VM_URL;

  // Strategy 1: Call Oracle VM backend API (preferred — no API key needed)
  if (vmUrl) {
    try {
      const result = await generateViaOracleVM(vmUrl, { topic, keywords });
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
      // If VM fails, fall back to direct LLM (if key available)
      console.error(`[generate-keywords] VM call failed: ${err.message}`);
    }
  }

  // Strategy 2: Direct LLM fallback (requires API key in Cloudflare env)
  const config = getLLMConfig(env);
  if (!config) {
    return new Response(
      JSON.stringify({
        error: "No backend configured. Set ORACLE_VM_URL to your Oracle VM API address, or set NVIDIA_API_KEY / OPENROUTER_API_KEY / OPENAI_API_KEY for direct LLM mode.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const result = await generateViaLLM(config, topic, keywords);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
