export function compareVersions(a: string, b: string): number;
export function fetchLatestBundle(
  repo: string,
  options?: { prerelease?: boolean; apiBase?: string },
): Promise<{ version: string; url: string; minShellVersion: string; checksum: string | null; prerelease: boolean } | null>;
