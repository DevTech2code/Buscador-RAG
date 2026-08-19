import { ServiceUnavailableException } from '@nestjs/common';

export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMilliseconds: number,
): Promise<unknown> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMilliseconds),
    });

    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return payload;
  } catch (error) {
    throw new ServiceUnavailableException('AI provider request failed', {
      cause: error,
    });
  }
}

export function requireText(value: unknown, provider: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ServiceUnavailableException(
      `${provider} returned an empty or invalid response`,
    );
  }

  return value.trim();
}
