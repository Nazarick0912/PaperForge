import { ArrowLeft, SquarePen } from "lucide-react";
import { Link } from "react-router";

import { APP_ROUTES } from "../../app/navigation";
import { EmptyState } from "../../components/feedback/EmptyState";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Card, CardContent, CardHeader } from "../../components/ui/Card";

const PLANNED_WORKFLOW_STEPS = [
  "Review and edit examination and quiz drafts in a unified workspace.",
  "Support mathematical expressions across questions and marking guides.",
  "A4 preview for verifying print layout before final distribution.",
  "Supported assessment exports for institutional delivery workflows.",
] as const;

export function EditorPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Unified Assessment Editor"
        description="Review, refine, and export examinations and quizzes in one consistent editing environment."
        badge={
          <div className="flex items-center gap-2">
            <Badge variant="neutral">Module 3</Badge>
            <Badge variant="warning">Under development</Badge>
          </div>
        }
        action={
          <Link
            to={APP_ROUTES.dashboard}
            className="inline-flex items-center gap-2 rounded-lg border border-pf-border bg-pf-surface px-3.5 py-2 text-sm font-medium text-pf-text shadow-xs transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-primary"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-pf-text">Planned workflow</h2>
          <p className="mt-1 text-sm text-pf-muted">
            The capabilities listed below describe planned Module 3 functionality and are not yet
            available in this skeleton release.
          </p>
        </CardHeader>
        <CardContent className="pt-2 pb-6">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-pf-text">
            {PLANNED_WORKFLOW_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <EmptyState
        icon={SquarePen}
        title="Assessment editing and export are under development"
        description="Rich editing, mathematical notation rendering, A4 layout preview, and export pipelines will be added in later implementation phases."
      />
    </div>
  );
}
