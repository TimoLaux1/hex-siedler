import { NextResponse } from "next/server";

const KEEP_ALIVE_QUERIES = 5;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  for (let index = 0; index < KEEP_ALIVE_QUERIES; index += 1) {
    const response = await fetch(`${supabaseUrl}/rest/v1/games?select=id&limit=1`, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: "Supabase keep-alive query failed." },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ ok: true, queries: KEEP_ALIVE_QUERIES });
}
