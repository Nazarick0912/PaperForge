import { ArrowRight, Info } from "lucide-react";
import { Link } from "react-router";

import { MODULE_NAVIGATION_ITEMS } from "../../app/navigation";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Card, CardContent, CardFooter, CardHeader } from "../../components/ui/Card";

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Create learning materials"
        description="PaperForge is an AI-assisted educational authoring workspace for preparing structured examinations, formative quizzes, unified assessments, and modular teaching slide decks."
        badge={<Badge variant="primary">Workspace foundation</Badge>}
      />

      <div
        role="note"
        className="flex items-start gap-3 rounded-xl border border-pf-border bg-pf-surface px-4 py-3.5 text-sm text-pf-muted"
      >
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-pf-primary" />
        <p>
          <span className="font-medium text-pf-text">Development status:</span> The shared frontend
          shell and module routes are active for local development. Backend API integration and
          shared domain contracts are pending in upcoming Phase 01 tasks.
        </p>
      </div>

      <section aria-labelledby="modules-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="modules-heading" className="text-base font-semibold text-pf-text">
            Authoring modules
          </h2>
          <span className="text-xs text-pf-muted">4 modules configured</span>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {MODULE_NAVIGATION_ITEMS.map((module) => {
            const Icon = module.icon;
            return (
              <Card key={module.id} className="flex flex-col justify-between">
                <div>
                  <CardHeader className="flex items-start justify-between gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pf-primary-soft text-pf-primary">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </div>
                    <Badge variant="neutral">Module {module.moduleNumber}</Badge>
                  </CardHeader>

                  <CardContent className="pt-1">
                    <h3 className="text-base font-semibold text-pf-text">{module.cardTitle}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-pf-muted">
                      {module.cardDescription}
                    </p>
                  </CardContent>
                </div>

                <CardFooter className="border-t border-pf-border pt-4">
                  <Link
                    to={module.path}
                    className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-pf-primary hover:text-pf-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-primary"
                  >
                    <span>Open {module.label}</span>
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
