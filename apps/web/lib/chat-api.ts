export interface CompletedChatResponse {
  reply: string;
  intent: string;
  aiProvider: string;
  stockAgeSeconds: number | null;
  stockFreshness: "fresh" | "stale" | "expired" | null;
  processingTimeMs: number;
}

interface StreamEvent {
  event: "progress" | "completed" | "error";
  data: unknown;
}

export async function createChatSession(): Promise<string> {
  const response = await fetch("/api/chat/sessions", { method: "POST" });
  if (!response.ok) throw new Error("No se pudo crear la sesión.");
  const body = (await response.json()) as { id?: unknown };
  if (typeof body.id !== "string")
    throw new Error("La sesión recibida no es válida.");
  return body.id;
}

export async function streamChatMessage(
  sessionId: string,
  content: string,
  onProgress: (message: string) => void,
): Promise<CompletedChatResponse> {
  const response = await fetch(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages/stream`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  if (!response.ok || !response.body)
    throw new Error("No se pudo iniciar la consulta.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: CompletedChatResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const parsed = parseSseBlock(block);
      if (!parsed) continue;
      if (parsed.event === "progress") {
        const progress = parsed.data as { message?: unknown };
        if (typeof progress.message === "string") onProgress(progress.message);
      } else if (parsed.event === "completed") {
        completed = parsed.data as CompletedChatResponse;
      } else {
        const error = parsed.data as { message?: unknown };
        throw new Error(
          typeof error.message === "string"
            ? error.message
            : "La consulta no pudo completarse.",
        );
      }
    }
    if (done) break;
  }

  if (!completed) throw new Error("La respuesta terminó de forma inesperada.");
  return completed;
}

function parseSseBlock(block: string): StreamEvent | null {
  let event: StreamEvent["event"] | null = null;
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:"))
      event = line.slice(6).trim() as StreamEvent["event"];
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!event || dataLines.length === 0) return null;
  return { event, data: JSON.parse(dataLines.join("\n")) as unknown };
}
