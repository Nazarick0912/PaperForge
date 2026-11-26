import { Route, Routes } from "react-router";

import { AppShell } from "../components/layout/AppShell";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { EditorPage } from "../features/editor/EditorPage";
import { ExamPage } from "../features/exam/ExamPage";
import { QuizPage } from "../features/quiz/QuizPage";
import { SlidesPage } from "../features/slides/SlidesPage";
import { NotFoundPage } from "../pages/NotFoundPage";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="exam" element={<ExamPage />} />
        <Route path="quiz" element={<QuizPage />} />
        <Route path="editor" element={<EditorPage />} />
        <Route path="slides" element={<SlidesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
