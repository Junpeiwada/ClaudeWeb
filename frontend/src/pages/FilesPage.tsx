import { useParams, useNavigate } from "react-router-dom";
import FileExplorer from "../components/FileExplorer";

export default function FilesPage() {
  const { repo, "*": splat } = useParams<{ repo: string; "*": string }>();
  const navigate = useNavigate();
  const repoId = repo ?? "";

  // React Router の splat はエンコード済みのまま返ることがあるためデコードする
  const filePath = splat ? decodeURIComponent(splat) : "";

  const handleNavigate = (path: string) => {
    const base = `/${encodeURIComponent(repoId)}/files`;
    const encodedPath = path
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    navigate(encodedPath ? `${base}/${encodedPath}` : base);
  };

  const handleSwitchToChat = () => {
    navigate(`/${encodeURIComponent(repoId)}/chat`);
  };

  return (
    <FileExplorer
      repoId={repoId}
      currentPath={filePath}
      onNavigate={handleNavigate}
      onSwitchToChat={handleSwitchToChat}
    />
  );
}
