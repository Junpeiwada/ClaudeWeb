import { useParams, useNavigate } from "react-router-dom";
import FileExplorer from "../components/FileExplorer";
import { filesPath } from "../utils/paths";

export default function FilesPage() {
  const { repo, "*": splat } = useParams<{ repo: string; "*": string }>();
  const navigate = useNavigate();
  const repoId = repo ?? "";

  // React Router の splat はエンコード済みのまま返ることがあるためデコードする
  const filePath = splat ? decodeURIComponent(splat) : "";

  const handleNavigate = (path: string) => navigate(filesPath(repoId, path));

  return (
    <FileExplorer
      repoId={repoId}
      currentPath={filePath}
      onNavigate={handleNavigate}
    />
  );
}
