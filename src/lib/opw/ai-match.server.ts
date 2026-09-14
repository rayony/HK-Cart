import type { ProductView } from "./types";

type AiPick = { id: string; code: string | null };

export async function aiPickMatches(
  items: Array<{ id: string; query: string; candidates: ProductView[] }>,
): Promise<AiPick[]> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey || items.length === 0) return [];

  const payload = items.slice(0, 12).map((item) => ({
    id: item.id,
    query: item.query,
    candidates: item.candidates.slice(0, 8).map((c) => ({
      code: c.code,
      brand: c.brand,
      name: c.name,
    })),
  }));

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你係香港超市購物清單配對助手。只可以揀候選入面嘅 code。唔肯定或者明顯唔同貨就回 null。只回 JSON：{\"picks\":[{\"id\":\"\",\"code\":null}]}",
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
    }),
  });

  if (!response.ok) return [];
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(text) as { picks?: AiPick[] };
    if (!Array.isArray(parsed.picks)) return [];
    return parsed.picks.filter((p) => typeof p.id === "string");
  } catch {
    return [];
  }
}
