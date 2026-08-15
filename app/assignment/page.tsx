import { AppShell } from "@/components/AppShell";
import { BootstrapPanel } from "@/components/BootstrapPanel";

export default function AssignmentPage() {
  return (
    <AppShell
      eyebrow="Step 02 of 03"
      title="Give the assignment some context."
      description="The planner will turn its weighting, deadline and rubric into an explainable workload recommendation."
    >
      <BootstrapPanel
        title="Assignment details"
        detail="The prototype will accept assignment basics, pasted text or a selected file, then return a structured mock analysis."
        action="Analyse assignment"
        items={["Choose the linked module", "Set the title, deadline and grade weight", "Paste or select the assignment brief", "Review the rubric-weighted workload"]}
      />
    </AppShell>
  );
}
