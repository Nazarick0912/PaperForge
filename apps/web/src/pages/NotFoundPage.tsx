import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router";

import { APP_ROUTES } from "../app/navigation";
import { Badge } from "../components/ui/Badge";
import { Card, CardContent } from "../components/ui/Card";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl py-8">
      <Card>
        <CardContent className="flex flex-col items-center px-6 py-10 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-pf-primary-soft text-pf-primary">
            <Compass aria-hidden="true" className="h-6 w-6" />
          </div>
          <Badge variant="neutral">404</Badge>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-pf-text">
            Page not found
          </h1>
          <p className="mt-2 text-sm leading-6 text-pf-muted">
            The page you requested does not match an available route in PaperForge. Return to the
            dashboard to access the authoring modules.
          </p>
          <Link
            to={APP_ROUTES.dashboard}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-pf-primary px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-pf-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-primary"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            <span>Return to Dashboard</span>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
