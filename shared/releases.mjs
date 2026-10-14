// Finding live updates on GitHub Releases, shared by the desktop main
// process (electron/updates.mjs) and the mobile apps (src/lib/updates.ts).
//
// Each release carries the built web app as spotifiak-web-<version>.zip and
// an update.json saying which app shells can run it (see release.yml).
// Pre-releases (tags with a "-", e.g. v1.2.0-beta.1) are only used by those
// who chose to get them (Settings, Updates).

/** "1.2.3-fix-2" → ["1.2.3", "fix-2"]: the pre-release part is everything after the first "-". */
function splitVersion(version) {
  const v = String(version).replace(/^v/, "");
  const dash = v.indexOf("-");
  return dash === -1 ? [v, ""] : [v.slice(0, dash), v.slice(dash + 1)];
}

/** Compares versions like "1.2.3" and "1.2.3-beta.1": negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a, b) {
  const [coreA, preA] = splitVersion(a);
  const [coreB, preB] = splitVersion(b);
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

/** The newest release with a web bundle: the latest stable one, or with `prerelease`, the newest of all. */
async function latestRelease(repo, apiBase, prerelease) {
  const headers = { Accept: "application/vnd.github+json" };
  if (!prerelease) {
    const res = await fetch(`${apiBase}/repos/${repo}/releases/latest`, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status}.`);
    return res.json();
  }
  const res = await fetch(`${apiBase}/repos/${repo}/releases?per_page=30`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status}.`);
  const releases = (await res.json()).filter(
    (r) => !r.draft && r.assets?.some((a) => a.name === "update.json"),
  );
  // Newest by version, not by date: a fix of an older version can come out later.
  return releases.reduce((best, r) => (!best || compareVersions(r.tag_name, best.tag_name) > 0 ? r : best), null);
}

/**
 * The latest release's web bundle, or null if there's no release with one.
 * @param {string} repo GitHub "owner/name"
 * @param {{ prerelease?: boolean, apiBase?: string }} [options] pre-releases too; GitHub API URL (another one only for testing)
 * @returns {Promise<{ version: string, url: string, minShellVersion: string, checksum: string | null, prerelease: boolean } | null>}
 */
export async function fetchLatestBundle(repo, { prerelease = false, apiBase = "https://api.github.com" } = {}) {
  const release = await latestRelease(repo, apiBase, prerelease);
  if (!release) return null;
  const version = String(release.tag_name).replace(/^v/, "");
  const zip = release.assets?.find((a) => a.name === `spotifiak-web-${version}.zip`);
  const manifest = release.assets?.find((a) => a.name === "update.json");
  if (!zip || !manifest) return null;
  const info = await (await fetch(manifest.browser_download_url)).json();
  return {
    version,
    url: zip.browser_download_url,
    minShellVersion: info.minShellVersion ?? "0.0.0",
    // SHA-256 of the zip, as lowercase hex; older releases have none.
    checksum: typeof info.checksum === "string" && /^[0-9a-f]{64}$/.test(info.checksum) ? info.checksum : null,
    prerelease: Boolean(release.prerelease),
  };
}
