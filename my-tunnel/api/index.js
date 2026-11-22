export const config = {
  runtime: 'edge',
};

const MY_SECRET_KEY = "my-secret-password-123";

const PROVIDERS = [
  {
    name: "TokenHarbor",
    url: "https://tokenharbor.ai/v1/chat/completions",
    apiKey: process.env.TOKENHARBOR_API_KEY || "",
    model: "deepseek-v4.1-flash:free"
  },
  {
    name: "Cloudflare",
    url: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
    apiKey: process.env.CLOUDFLARE_API_TOKEN || "",
    model: "@cf/meta/llama-3.1-8b-instruct"
  },
  {
    name: "Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    apiKey: process.env.GEMINI_API_KEY || "",
    model: "gemini-2.5-flash"
  }
];

export default async function handler(req) {
  // Используем безопасное получение пути, чтобы не падало на '/'
  const pathname = new URL(req.url, "http://localhost").pathname;

  // 1. CORS
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

  // 2. Авторизация
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${MY_SECRET_KEY}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  // 3. Список моделей
  if (pathname.endsWith("/models")) {
    return new Response(JSON.stringify({
      object: "list",
      data: [{ id: "auto-router", object: "model" }]
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  // 4. Чат
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

    for (const provider of PROVIDERS) {
      if (!provider.apiKey || provider.apiKey.trim() === "") continue;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // Увеличили до 30 сек

        const res = await fetch(provider.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            ...body,
            model: provider.model,
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (res.ok) {
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
            console.error(`[Proxy] ${provider.name} failed with status: ${res.status}`);
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

  // 5. Корень сайта
  return new Response("Tunnel is active", { 
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*" }
  });
}
