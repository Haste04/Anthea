import { NextRequest, NextResponse } from "next/server";
import { appendFile, mkdir } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const line = JSON.stringify({
      ...body,
      sessionId: body.sessionId ?? "779f22",
      timestamp: body.timestamp ?? Date.now(),
    });
    const dir = path.join(process.cwd(), ".cursor");
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, "debug-779f22.log"), line + "\n", "utf8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "fail" },
      { status: 500 }
    );
  }
}
