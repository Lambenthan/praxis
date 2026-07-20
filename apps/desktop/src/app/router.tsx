import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { SessionPage } from "./routes/SessionPage";
import { LiveSessionPage } from "./routes/LiveSessionPage";
import { SkillsPage } from "./routes/SkillsPage";
import { PermissionsPage } from "@/features/agent-runtime/PermissionsPage";
import { NotebooksPage } from "./routes/NotebooksPage";
import { FilesPage } from "./routes/FilesPage";
import { LiteraturePage } from "./routes/LiteraturePage";
import { SettingsPage } from "./routes/SettingsPage";
import { SetupPage } from "./routes/SetupPage";
import { NotFound } from "./routes/NotFound";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/live" replace /> },
      { path: "live", element: <LiveSessionPage /> },
      { path: "live/:sessionId", element: <LiveSessionPage /> },
      { path: "example/:sessionId", element: <SessionPage /> },
      { path: "skills", element: <SkillsPage /> },
      { path: "permissions", element: <PermissionsPage /> },
      { path: "notebooks", element: <NotebooksPage /> },
      { path: "files", element: <FilesPage /> },
      { path: "literature", element: <LiteraturePage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "setup", element: <SetupPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
