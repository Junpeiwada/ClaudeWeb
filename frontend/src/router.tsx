import { createBrowserRouter, Navigate } from "react-router-dom";
import MinimalLayout from "./layouts/MinimalLayout";
import RootLayout from "./layouts/RootLayout";
import FilesPage from "./pages/FilesPage";
import RepoRedirect from "./pages/RepoRedirect";
import ChatPlaceholder from "./pages/ChatPlaceholder";
import GitPage from "./pages/GitPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MinimalLayout />,
    children: [
      { index: true, element: <RepoRedirect /> },
      {
        path: ":repo",
        element: <RootLayout />,
        children: [
          { index: true, element: <Navigate to="chat" replace /> },
          { path: "chat", element: <ChatPlaceholder /> },
          { path: "chat/:sessionId", element: <ChatPlaceholder /> },
          { path: "files", element: <FilesPage /> },
          { path: "files/*", element: <FilesPage /> },
          { path: "git", element: <GitPage /> },
        ],
      },
    ],
  },
]);
