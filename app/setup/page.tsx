import { AppShell } from "@/components/AppShell";
import { SetupWorkspace } from "@/components/SetupWorkspace";

export default function SetupPage() {
  return (
    <AppShell
      eyebrow="Step 01 of 03"
      title="Start with the week you actually have."
      description="Add your modules and recurring commitments once. Your study plan will use this as its real-world boundary."
    >
      <SetupWorkspace />
    </AppShell>
  );
}
