// Usernames are never case-sensitive: Navidrome takes logins in any case, so
// "Youf", "youf" and "YOUF" are the same person. The app and the Jam server
// use the lowercase name (server/names.mjs); names from Navidrome itself (a
// playlist's owner, Friend activity) go through nameKey before comparing.

/** The one spelling a name is known by. */
export const nameKey = (username: string): string => username.trim().toLowerCase();

/** Whether two names are the same person, whatever their case. */
export function sameUser(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && nameKey(a) === nameKey(b));
}
