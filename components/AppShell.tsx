"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
};

const steps = [
  { href: "/setup", label: "Setup", number: "01" },
  { href: "/assignment", label: "Assignment", number: "02" },
  { href: "/plan", label: "Plan", number: "03" },
];

export function AppShell({ children, eyebrow, title, description }: AppShellProps) {
  const pathname = usePathname();
  const matchedStep = steps.findIndex((step) => pathname.startsWith(step.href));
  const currentStep = matchedStep === -1 ? 0 : matchedStep;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 pb-10 pt-5 sm:px-8 sm:pt-8">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
        <Link href="/setup" className="group inline-flex items-center gap-3 rounded-md">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent)] text-sm font-bold text-white shadow-sm transition-transform duration-200 group-hover:-rotate-3">
            IF
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-[-0.02em]">Impact Forge</span>
            <span className="block text-xs text-[var(--muted-ink)]">Assignment scheduler</span>
          </span>
        </Link>
        <span className="hidden rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--muted-ink)] sm:inline-flex">
          Prototype workspace
        </span>
      </header>

      <nav aria-label="Planning steps" className="mt-6">
        <ol className="grid grid-cols-3 gap-2 sm:flex sm:gap-3">
          {steps.map((step, index) => {
            const isCurrent = index === currentStep;
            const isComplete = index < currentStep;

            return (
              <li key={step.href} className="min-w-0 flex-1">
                <Link
                  href={step.href}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors duration-200 ${
                    isCurrent
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : isComplete
                        ? "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                        : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted-ink)] hover:border-[var(--accent)]"
                  }`}
                >
                  <span className="text-[11px] font-bold tracking-[0.08em]">{isComplete ? "OK" : step.number}</span>
                  <span className="truncate font-semibold">{step.label}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="mt-10 max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent-strong)]">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-[var(--muted-ink)]">{description}</p>
      </section>

      <section className="mt-8 flex-1">{children}</section>
    </main>
  );
}
