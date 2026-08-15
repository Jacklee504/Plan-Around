type BootstrapPanelProps = {
  title: string;
  detail: string;
  action: string;
  items: string[];
};

export function BootstrapPanel({ title, detail, action, items }: BootstrapPanelProps) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_14px_40px_oklch(0.24_0.025_252_/_0.06)] sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.03em]">{title}</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--muted-ink)]">{detail}</p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--accent-strong)]"
        >
          {action}
        </button>
      </div>

      <ul className="mt-7 grid gap-2 border-t border-[var(--line)] pt-5 sm:grid-cols-2">
        {items.map((item, index) => (
          <li key={item} className="flex items-center gap-3 rounded-xl bg-[var(--surface-soft)] px-3 py-3 text-sm text-[var(--ink)]">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[11px] font-bold text-[var(--accent-strong)]">
              {String(index + 1).padStart(2, "0")}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
