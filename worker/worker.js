// Cloudflare Worker: proxies Gemini calls so the API key never reaches the browser.
// Deploy with wrangler (see mikke-web/README.md). Secrets required:
//   GEMINI_API_KEY - your Gemini API key
//   ACCESS_CODE    - shared passphrase demo users must supply

const MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { accessCode, prompt, schema } = body ?? {};

    if (!env.ACCESS_CODE || accessCode !== env.ACCESS_CODE) {
      return json({ error: "Invalid access code" }, 401);
    }
    if (typeof prompt !== "string" || !prompt) {
      return json({ error: "Missing prompt" }, 400);
    }

    const geminiRes = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.4,
        },
      }),
    });

    const text = await geminiRes.text();
    return new Response(text, {
      status: geminiRes.status,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
