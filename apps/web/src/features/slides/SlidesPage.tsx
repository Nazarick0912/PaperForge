import { ArrowLeft, Presentation } from "lucide-react";
import { Link } from "react-router";

import { APP_ROUTES } from "../../app/navigation";
import { EmptyState } from "../../components/feedback/EmptyState";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Card, CardContent, CardHeader } from "../../components/ui/Card";

const PLANNED_WORKFLOW_STEPS = [
  "Generate structured slide outlines and modular teaching decks.",
  "Revise selected sections without regenerating the entire presentation.",
  "PPTX export for classroom presentation and instructor customization.",
] as const;

export function SlidesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Modular Slide Deck Generator"
        description="Create teaching slides and iteratively revise selected sections for classroom delivery."
        badge={
          <div className="flex items-center gap-2">
            <Badge variant="neutral">Module 4</Badge>
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
            The capabilities listed below describe planned Module 4 functionality and are not yet
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
        icon={Presentation}
        title="Slide deck generation is under development"
        description="Outline drafting, section-level slide revision, and PPTX export workflows will be added in later implementation phases."
      />
    </div>
  );
}
