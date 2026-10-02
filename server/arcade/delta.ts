// Delta encoding for entity lists that have stable ids (food, loot, things): each snapshot only
// carries what was added and the ids that disappeared since the previous snapshot.
export const diffById = <T extends { id: number }, E>(
  items: T[],
  mem: Record<string, unknown>,
  key: string,
  full: boolean,
  encode: (t: T) => E,
): { add: E[]; del: number[] } => {
  const known = full ? new Set<number>() : (mem[key] as Set<number> | undefined) ?? new Set<number>()
  const cur = new Set<number>()
  const add: E[] = []
  for (const it of items) {
    cur.add(it.id)
    if (!known.has(it.id)) add.push(encode(it))
  }
  const del = [...known].filter(id => !cur.has(id))
  if (!full) mem[key] = cur
  return { add, del }
}
