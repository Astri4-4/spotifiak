// Usernames are never case-sensitive: Navidrome takes logins in any case, so
// "Youf", "youf" and "YOUF" are the same person. Everything here is filed
// under the lowercase name, and what was saved under another spelling is
// merged in when it's loaded.

/** The one spelling a name is filed under. */
export const nameKey = (username) => String(username).trim().toLowerCase();

/**
 * Entries keyed by username, keyed by nameKey instead: two spellings of the
 * same name are combined with `merge(kept, other)` (the first one by default).
 * @template T
 * @param {Iterable<[string, T]>} entries
 * @param {(kept: T, other: T) => T} [merge]
 * @returns {Map<string, T>}
 */
export function byName(entries, merge = (kept) => kept) {
  const out = new Map();
  for (const [name, value] of entries) {
    const key = nameKey(name);
    out.set(key, out.has(key) ? merge(out.get(key), value) : value);
  }
  return out;
}
