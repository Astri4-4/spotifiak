export function compareVersions(a: string, b: string): number;
export function fetchLatestBundle(repo: string, apiBase?: string): Promise<{ version: string; url: string; minShellVersion: string } | null>;
