export const config = {
  runtime: 'edge',
};

const MY_SECRET_KEY = "my-secret-password-123";

const PROVIDERS = [
  {
    id: "tokenharbor",
    name: "TokenHarbor",
    url: "https://tokenharbor.ai" + "/v1/chat/completions",
    apiKey: process.env.TOKENHARBOR_API_KEY || "",
    model: "deepseek-v4.1-flash:free"
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

    const provider = PROVIDERS[0];

    if (!provider.apiKey || provider.apiKey.trim() === "") {
      return new Response(JSON.stringify({ error: "API key is missing" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const cleanPayload = {
      messages: body.messages,
      stream: Boolean(body.stream),
      ...(body.temperature !== undefined && { temperature: body.temperature }),
      ...(body.max_tokens !== undefined && { max_tokens: body.max_tokens }),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          ...cleanPayload,
          model: provider.model,
        }),
        signal: controller.signal
      });

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
        const errText = await res.text();
        console.error(`[Proxy] ${provider.name} failed (${res.status}): ${errText}`);
        return new Response(errText, {
          status: res.status,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    } catch (e) {
      console.error(`[Proxy] ${provider.name} network error:`, e.message);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return new Response("Tunnel is active", { status: 200 });
}
