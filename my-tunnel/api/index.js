export const config = {
  runtime: 'edge',
};

const MY_SECRET_KEY = "my-secret-password-123";

const PROVIDERS = [
  {
    id: "tokenharbor",
    name: "TokenHarbor",
    url: "https://tokenharbor.ai/v1/chat/completions",
    apiKey: process.env.TOKENHARBOR_API_KEY || "",
    model: "deepseek-v4.1-flash:free"
  },
  {
    id: "gemini",
    name: "Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    apiKey: process.env.GEMINI_API_KEY || "",
    model: "gemini-2.5-flash"
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    url: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
    apiKey: process.env.CLOUDFLARE_API_TOKEN || "",
    model: "@cf/deepseek-ai/deepseek-v4-flash-0731"
  }
];

export default async function handler(req) {
  const pathname = new URL(req.url, "http://localhost").pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${MY_SECRET_KEY}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  // Возвращаем список моделей для OpenCode
  if (pathname.endsWith("/models")) {
    return new Response(JSON.stringify({
      object: "list",
      data: PROVIDERS.map(p => ({ id: p.id, object: "model" }))
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  if (pathname.endsWith("/chat/completions") && req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const requestedModel = body.model || "auto-router";

    // Сортируем провайдеров: выбранный пользователем — первым
    const sortedProviders = [...PROVIDERS].sort((a, b) => {
      if (a.id === requestedModel) return -1;
      if (b.id === requestedModel) return 1;
      return 0;
    });

    for (const provider of sortedProviders) {
  if (!provider.apiKey || provider.apiKey.trim() === "") continue;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    // Формируем заголовки
    const headers = {
      "Content-Type": "application/json",
    };

    // Если это Gemini — используем x-goog-api-key, иначе Authorization: Bearer
    if (provider.id === "gemini") {
      headers["x-goog-api-key"] = provider.apiKey;
    } else {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    }

    const res = await fetch(provider.url, {
      method: "POST",
      headers: headers, // <-- передаем сформированные заголовки
      body: JSON.stringify({
        ...body,
        model: provider.model,
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);   

        if (res.ok) {
          console.log(`[SUCCESS] Ответ от: ${provider.name} (${provider.model})`);
          return new Response(res.body, {
            status: res.status,
            headers: {
              "Content-Type": res.headers.get("Content-Type") || "text/event-stream",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "no-cache",
              "X-Accel-Buffering": "no"
            }
          });
        } else {
          console.error(`[Proxy] ${provider.name} failed: ${res.status}`);
        }
      } catch (e) {
        console.error(`[Proxy] ${provider.name} network error:`, e.message);
      }
    }

    return new Response(JSON.stringify({ error: "All providers failed or exhausted" }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  return new Response("Tunnel is active", { status: 200 });
}
