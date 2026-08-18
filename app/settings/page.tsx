import { AppShell } from "@/components/AppShell";
import { SettingsWorkspace } from "@/components/SettingsWorkspace";

export default function SettingsPage() {
  return (
    <AppShell
      eyebrow="Preferences"
      title="Plan study around how you work."
      description="These settings affect where future study sessions are placed. They never change how much work an assignment needs."
    >
      <SettingsWorkspace />
    </AppShell>
  );
}
