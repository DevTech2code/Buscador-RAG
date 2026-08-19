import { NextRequest, NextResponse } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3000";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;
    const upstream = await fetch(
      `${apiUrl}/chat/sessions/${encodeURIComponent(sessionId)}/messages/stream`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: await request.text(),
        cache: "no-store",
        signal: request.signal,
      },
    );
    if (!upstream.body) {
      return NextResponse.json(
        { message: "El flujo no está disponible." },
        { status: 502 },
      );
    }
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "No se pudo conectar con el asistente." },
      { status: 503 },
    );
  }
}
