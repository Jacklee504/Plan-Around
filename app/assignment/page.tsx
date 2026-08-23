import { AppShell } from "@/components/AppShell";
import { AssignmentWorkspace } from "@/components/AssignmentWorkspace";

export default function AssignmentPage() {
  return (
    <AppShell
      eyebrow="Assignments"
      title="Add an assignment."
      description="Start with the essentials. PlanAround will make an explainable workload recommendation before it creates a study plan."
    >
      <AssignmentWorkspace />
    </AppShell>
  );
}
