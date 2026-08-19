import { NextResponse } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3000";

export async function POST() {
  try {
    const upstream = await fetch(`${apiUrl}/chat/sessions`, {
      method: "POST",
      cache: "no-store",
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { message: "El servicio de conversación no está disponible." },
      { status: 503 },
    );
  }
}
