// Finding live updates on GitHub Releases, shared by the desktop main
// process (electron/updates.mjs) and the mobile apps (src/lib/updates.ts).
//
// Each release carries the built web app as spotifiak-web-<version>.zip and
// an update.json saying which app shells can run it (see release.yml).
// Pre-releases are ignored: GitHub's "latest release" skips them.

/** Compares versions like "1.2.3" and "1.2.3-beta.1": negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a, b) {
  const [coreA, preA] = String(a).replace(/^v/, "").split("-", 2);
  const [coreB, preB] = String(b).replace(/^v/, "").split("-", 2);
  const partsA = coreA.split(".").map(Number);
  const partsB = coreB.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff) return diff;
  }
  // A release sorts after its pre-releases (1.0.0 > 1.0.0-beta.1).
  if (!preA || !preB) return (preA ? -1 : 0) - (preB ? -1 : 0);
  return preA.localeCompare(preB, undefined, { numeric: true });
}

/**
 * The latest release's web bundle, or null if there's no release with one.
 * @param {string} repo GitHub "owner/name"
 * @param {string} [apiBase] GitHub API URL; another one only for testing
 * @returns {Promise<{ version: string, url: string, minShellVersion: string } | null>}
 */
export async function fetchLatestBundle(repo, apiBase = "https://api.github.com") {
  const res = await fetch(`${apiBase}/repos/${repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status}.`);
  const release = await res.json();
  const version = String(release.tag_name).replace(/^v/, "");
  const zip = release.assets?.find((a) => a.name === `spotifiak-web-${version}.zip`);
  const manifest = release.assets?.find((a) => a.name === "update.json");
  if (!zip || !manifest) return null;
  const info = await (await fetch(manifest.browser_download_url)).json();
  return { version, url: zip.browser_download_url, minShellVersion: info.minShellVersion ?? "0.0.0" };
}
