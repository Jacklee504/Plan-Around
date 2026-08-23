import { AppShell } from "@/components/AppShell";
import { SettingsWorkspace } from "@/components/SettingsWorkspace";

export default function SettingsPage() {
  return (
    <AppShell
      eyebrow="Preferences"
      title="Fit each assignment around your week."
      description="Choose when and how PlanAround schedules assignment work. Preferences save automatically."
    >
      <SettingsWorkspace />
    </AppShell>
  );
}
