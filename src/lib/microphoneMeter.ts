/** Audio sampling stays outside page state; subscribers choose their own snapshot. */
export function createMicrophoneMeter() {
  let level = 0;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => level,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next: number | ((current: number) => number)) {
      const value = typeof next === "function" ? next(level) : next;
      if (value === level) return;
      level = value;
      listeners.forEach((listener) => listener());
    },
  };
}
