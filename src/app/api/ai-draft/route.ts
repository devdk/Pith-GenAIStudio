import { NextRequest, NextResponse } from "next/server";
import { ANTHROPIC_API_KEY } from "@/lib/env";

/** Whether AI drafting is available (needs ANTHROPIC_API_KEY in .env). */
export async function GET() {
  return NextResponse.json({ enabled: Boolean(ANTHROPIC_API_KEY) });
}

const SYSTEM = `You write scripts for short square social videos (25-40s).
Given a brief, produce a JSON object with a "beats" array. Beat types, in a
sensible order: hook, stat, problem, solution, cta, logo. Each beat has:
type, durationInFrames (hook/stat/cta 90, problem 100, solution 130, logo 75),
narration (1-2 spoken sentences carrying the detail), and on-screen fields:
hook: eyebrow, title (max 8 words), subtitle
stat: value (number only), unit, label (max 10 words)
problem: eyebrow, title (max 8 words), body (max 14 words)
solution: eyebrow, title (max 6 words), bullets (3 max, 8 words each)
cta: title (max 6 words), subtitle (the URL), cta (2-3 word button)
logo: brand, tagline (max 6 words) — logo narration is just the brand line.
Screen text carries punchlines; narration carries detail. UK English.
Return ONLY the JSON object.`;

export async function POST(req: NextRequest) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI drafting is not configured (set ANTHROPIC_API_KEY in .env)." },
      { status: 501 }
    );
  }
  const { brief } = (await req.json()) as { brief?: string };
  if (!brief?.trim()) {
    return NextResponse.json({ error: "brief is required" }, { status: 400 });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: brief }],
    }),
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}` },
      { status: 502 }
    );
  }
  const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const text = json.content.find((c) => c.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: "model returned no JSON" }, { status: 502 });
  try {
    return NextResponse.json(JSON.parse(match[0]));
  } catch {
    return NextResponse.json({ error: "model returned invalid JSON" }, { status: 502 });
  }
}
