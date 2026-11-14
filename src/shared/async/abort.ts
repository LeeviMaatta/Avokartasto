/** Throws an `AbortError` `DOMException` when `signal` is already aborted. */
export function throwIfAborted(signal?: AbortSignal, message = "The operation was aborted."): void {
  if (signal?.aborted) {
    throw new DOMException(message, "AbortError");
  }
}

/** Wraps a non-cancellable promise so it rejects immediately when `signal` aborts. */
export async function runWithAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  message = "The operation was aborted.",
): Promise<T> {
  throwIfAborted(signal, message);
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException(message, "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}
