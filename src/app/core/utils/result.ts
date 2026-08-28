export type DomainResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function ok<T>(value: T): DomainResult<T> {
  return { ok: true, value };
}

export function fail<T = never>(error: string): DomainResult<T> {
  return { ok: false, error };
}
