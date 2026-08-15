import { AppShell } from "@/components/AppShell";
import { BootstrapPanel } from "@/components/BootstrapPanel";

export default function SetupPage() {
  return (
    <AppShell
      eyebrow="Step 01 of 03"
      title="Start with the week you actually have."
      description="Add your modules and recurring commitments once. Your study plan will use this as its real-world boundary."
    >
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <BootstrapPanel
          title="Modules"
          detail="ECTS credits give the planner a grounded starting point for recommended workload."
          action="Add module"
          items={["Module name and optional code", "ECTS credits", "More than one module if needed"]}
        />
        <BootstrapPanel
          title="Weekly rhythm"
          detail="Block out the time that is already spoken for, from classes to work and meals."
          action="Add commitment"
          items={["Day and time range", "A clear label", "Class, work, gym, meal or other"]}
        />
      </div>
      <p className="mt-5 text-sm text-[var(--muted-ink)]">This is the layout foundation. Forms and local browser storage come next.</p>
    </AppShell>
  );
}
