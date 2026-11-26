import {
  FileText,
  LayoutDashboard,
  ListChecks,
  Presentation,
  SquarePen,
  type LucideIcon,
} from "lucide-react";

export const APP_ROUTES = {
  dashboard: "/",
  exam: "/exam",
  quiz: "/quiz",
  editor: "/editor",
  slides: "/slides",
} as const;

export type AppRoutePath = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];

export interface NavigationItem {
  id: "dashboard" | "exam" | "quiz" | "editor" | "slides";
  label: string;
  path: AppRoutePath;
  icon: LucideIcon;
  end?: boolean;
}

export interface ModuleNavigationItem extends NavigationItem {
  id: "exam" | "quiz" | "editor" | "slides";
  moduleNumber: 1 | 2 | 3 | 4;
  cardTitle: string;
  cardDescription: string;
}

export const MODULE_NAVIGATION_ITEMS: readonly ModuleNavigationItem[] = [
  {
    id: "exam",
    moduleNumber: 1,
    label: "Exam Generator",
    cardTitle: "Exam Question Papers",
    cardDescription: "Create structured examinations and draft marking schemes.",
    path: APP_ROUTES.exam,
    icon: FileText,
  },
  {
    id: "quiz",
    moduleNumber: 2,
    label: "Quiz Generator",
    cardTitle: "Source-Based Quizzes",
    cardDescription: "Create formative quizzes from instructional source materials.",
    path: APP_ROUTES.quiz,
    icon: ListChecks,
  },
  {
    id: "editor",
    moduleNumber: 3,
    label: "Assessment Editor",
    cardTitle: "Assessment Editor",
    cardDescription: "Review, refine and export examinations and quizzes.",
    path: APP_ROUTES.editor,
    icon: SquarePen,
  },
  {
    id: "slides",
    moduleNumber: 4,
    label: "Slide Generator",
    cardTitle: "Slide Deck Generator",
    cardDescription: "Create teaching slides and revise selected sections.",
    path: APP_ROUTES.slides,
    icon: Presentation,
  },
];

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: APP_ROUTES.dashboard,
    icon: LayoutDashboard,
    end: true,
  },
  ...MODULE_NAVIGATION_ITEMS,
];
