import { AppShell } from "@/components/AppShell";
import { AssignmentWorkspace } from "@/components/AssignmentWorkspace";

export default function AssignmentPage() {
  return (
    <AppShell
      eyebrow="Assignments"
      title="Give the assignment some context."
      description="Add the details you already have. PlanAround will turn them into an explainable workload recommendation before it makes a study plan."
    >
      <AssignmentWorkspace />
    </AppShell>
  );
}
