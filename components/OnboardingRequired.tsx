import Link from "next/link";

export function OnboardingRequired({ destination = "assignment" }: { destination?: "assignment" | "plan" }) {
  return (
    <section className="border-y border-[var(--line)] bg-[var(--surface-soft)] px-5 py-7" aria-labelledby="setup-required-heading">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Finish setup first</p>
      <h2 id="setup-required-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Start with your recurring week.</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">PlanAround needs your normal classes and weekly commitments before it can build {destination === "plan" ? "a realistic study plan" : "an assignment around your actual availability"}.</p>
      <Link href="/setup" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">Finish setup</Link>
    </section>
  );
}
