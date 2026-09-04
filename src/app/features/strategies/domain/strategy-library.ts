import { Strategy } from './strategy';
export function filterAndSortStrategies(
  strategies: readonly Strategy[],
  query: string,
): readonly Strategy[] {
  const normalized = query.trim().toLocaleLowerCase('es');
  return [...strategies]
    .filter(({ name }) => !normalized || name.toLocaleLowerCase('es').includes(normalized))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
