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
  const url = new URL(req.url);

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

  if (url.pathname.endsWith("/models")) {
    return new Response(JSON.stringify({
      object: "list",
      data: [{ id: "auto-router", object: "model" }]
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  if (url.pathname.endsWith("/chat/completions") && req.method === "POST") {
    const body = await req.clone().json();

    for (const provider of PROVIDERS) {
      
      if (!provider.apiKey || provider.apiKey.trim() === "") continue; 

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

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
              "Content-Type": res.headers.get("Content-Type") || "application/json",
              "Access-Control-Allow-Origin": "*"
            } 
          });
        }
      } catch (e) {
        console.error(`[Proxy] ${provider.name} failed:`, e.message);
      }
    }

    return new Response(JSON.stringify({ error: "All providers failed or exhausted" }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  return new Response("Tunnel is active", { 
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*" }
  });
}
