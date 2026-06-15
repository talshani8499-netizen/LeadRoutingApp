export function Badge({
  label,
  cls,
  live = false,
}: {
  label: string;
  cls: string;
  live?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {live && (
        <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {label}
    </span>
  );
}
