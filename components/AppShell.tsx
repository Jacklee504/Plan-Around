"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useOnboardingState } from "@/lib/onboarding";

type AppShellProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
};

const navigation = [
  { href: "/setup", label: "Calendar" },
  { href: "/assignment", label: "Assignments" },
  { href: "/plan", label: "Plan" },
];

export function AppShell({ children, eyebrow, title, description }: AppShellProps) {
  const pathname = usePathname();
  const { onboarding, isOnboardingLoaded } = useOnboardingState();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 pb-10 pt-5 sm:px-8 sm:pt-8">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
        <Link href="/setup" className="group inline-flex items-center gap-3 rounded-md">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent)] text-sm font-bold text-white shadow-sm transition-transform duration-200 group-hover:-rotate-3">
            PA
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-[-0.02em]">PlanAround</span>
            <span className="block text-xs text-[var(--muted-ink)]">Fit assignments around your actual week.</span>
          </span>
        </Link>
        <span className="hidden rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--muted-ink)] sm:inline-flex">
          Prototype workspace
        </span>
      </header>

      {isOnboardingLoaded && onboarding.completed ? <nav aria-label="Product navigation" className="mt-6">
        <ol className="grid grid-cols-3 gap-2 sm:flex sm:gap-3">
          {navigation.map((item) => {
            const isCurrent = pathname.startsWith(item.href);

            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`flex min-h-12 items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    isCurrent
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted-ink)] hover:border-[var(--accent)]"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav> : null}

      <section className="mt-10 max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent-strong)]">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-[var(--muted-ink)]">{description}</p>
      </section>

      <section className="mt-8 flex-1">{children}</section>
    </main>
  );
}
