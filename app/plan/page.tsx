import { AppShell } from "@/components/AppShell";
import { PlanWorkspace } from "@/components/PlanWorkspace";

export default function PlanPage() {
  return (
    <AppShell
      eyebrow="Study plan"
      title="See the work fit into your week."
      description="Place focused assignment sessions around the classes and commitments already in your week."
    >
      <PlanWorkspace />
    </AppShell>
  );
}
