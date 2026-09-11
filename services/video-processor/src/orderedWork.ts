/** Pipeline independent I/O, publishing results in the original order. */
export async function orderedWork<T, R>(
  items: readonly T[],
  concurrency: number,
  work: (item: T, index: number) => Promise<R>,
  publish: (result: R) => void | Promise<void>,
): Promise<R[]> {
  const pending = new Map<number, Promise<{ value: R } | { error: unknown }>>();
  const results: R[] = [];
  let next = 0;
  const fill = () => {
    while (next < items.length && pending.size < concurrency) {
      const index = next++;
      pending.set(
        index,
        Promise.resolve()
          .then(() => work(items[index]!, index))
          .then(
            (value) => ({ value }),
            (error: unknown) => ({ error }),
          ),
      );
    }
  };
  fill();
  try {
    for (let index = 0; index < items.length; index++) {
      const result = await pending.get(index)!;
      if ("error" in result) throw result.error;
      await publish(result.value);
      results.push(result.value);
      pending.delete(index);
      fill();
    }
    return results;
  } finally {
    // Callers can safely clean up source buffers/files after any failure.
    await Promise.all(pending.values());
  }
}
