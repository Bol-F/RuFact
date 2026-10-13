interface TextBody {
  body: ReadableStream<Uint8Array> | null;
  headers: Pick<Headers, "get">;
}

interface ReadOptions {
  maxBytes: number;
  signal?: AbortSignal;
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("Body exceeds the byte limit");
    this.name = "BodyTooLargeError";
  }
}

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

/** Read a UTF-8 body without first buffering an unbounded request/response. */
export async function readBoundedText(
  source: TextBody,
  { maxBytes, signal }: ReadOptions,
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }

  const reader = source.body?.getReader();
  const cancel = (reason: unknown) => {
    // Cancellation must not delay rejection if an upstream cancel hook stalls.
    // Its rejection is intentionally handled, including already-errored streams.
    void reader?.cancel(reason).catch(() => undefined);
  };
  const onAbort = () => cancel(abortReason(signal!));

  try {
    if (signal?.aborted) throw abortReason(signal);

    const declaredLength = source.headers.get("content-length")?.trim();
    if (declaredLength && /^\d+$/u.test(declaredLength) && Number(declaredLength) > maxBytes) {
      throw new BodyTooLargeError();
    }
    if (!reader) return "";

    signal?.addEventListener("abort", onAbort, { once: true });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const parts: string[] = [];
    let bytes = 0;

    while (true) {
      if (signal?.aborted) throw abortReason(signal);
      const { done, value } = await reader.read();
      if (signal?.aborted) throw abortReason(signal);
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new TypeError("Body stream must contain byte chunks");
      }
      if (value.byteLength > maxBytes - bytes) throw new BodyTooLargeError();
      bytes += value.byteLength;
      // Decoder state retains incomplete multi-byte characters across chunks.
      const part = decoder.decode(value, { stream: true });
      if (part) parts.push(part);
    }

    parts.push(decoder.decode());
    return parts.join("");
  } catch (error) {
    cancel(error);
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader?.releaseLock();
  }
}
