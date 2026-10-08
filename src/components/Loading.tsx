export function Loading({ label }: { label?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 py-20 text-spotify-gray">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-spotify-gray-subdued border-t-spotify-green" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
