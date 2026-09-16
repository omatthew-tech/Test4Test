export function checkAuthHealth(
  config: { url: string; key: string; origin?: string },
  fetcher?: typeof fetch,
): Promise<Array<{ name: string; ok: boolean; milliseconds: number; error?: string }>>;
