import { AppShell } from "@/components/AppShell";
import { SetupWorkspace } from "@/components/SetupWorkspace";

export default function SetupPage() {
  return (
    <AppShell
      eyebrow="Calendar"
      title="Your actual week, in one place."
      description="Bring in your semester timetable, then keep classes and personal commitments together in the calendar your study plan will use."
    >
      <SetupWorkspace />
    </AppShell>
  );
}
