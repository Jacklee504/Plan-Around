import { AppShell } from "@/components/AppShell";
import { BootstrapPanel } from "@/components/BootstrapPanel";

export default function PlanPage() {
  return (
    <AppShell
      eyebrow="Step 03 of 03"
      title="See the work fit into your week."
      description="A deterministic scheduler will place focused sessions into free time and make deadline pressure visible."
    >
      <BootstrapPanel
        title="Generated study plan"
        detail="Once the setup and assignment details are complete, this page will present the recommended sessions grouped by day."
        action="Generate plan"
        items={["Keep the 24-hour deadline buffer where possible", "Use 60–120 minute study sessions", "Spread work across available days", "Flag tight or impossible schedules"]}
      />
    </AppShell>
  );
}
