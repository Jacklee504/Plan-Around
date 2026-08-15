import { AppShell } from "@/components/AppShell";
import { SetupWorkspace } from "@/components/SetupWorkspace";

export default function SetupPage() {
  return (
    <AppShell
      eyebrow="Step 01 of 03"
      title="Start with the week you actually have."
      description="Bring in your semester timetable, then keep classes and personal commitments together in one calendar. Your study plan will use it as a real-world boundary."
    >
      <SetupWorkspace />
    </AppShell>
  );
}
