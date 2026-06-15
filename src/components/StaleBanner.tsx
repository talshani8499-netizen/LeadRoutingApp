// Shows when a live poll is failing, so a frozen dashboard never silently
// masquerades as a quiet system.
export function StaleBanner({
  error,
  lastUpdated,
}: {
  error: string | null;
  lastUpdated: number | null;
}) {
  if (!error) return null;
  const secs = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 flex items-center gap-2"
    >
      <span aria-hidden="true">⚠</span>
      <span>
        Live data interrupted — retrying…
        {secs !== null && ` Last updated ${secs}s ago.`}
      </span>
    </div>
  );
}
