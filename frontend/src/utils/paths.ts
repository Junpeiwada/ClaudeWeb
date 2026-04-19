// ファイルパスをセグメント単位でエンコード（スラッシュを保持）
export const encodeFilePath = (path: string) =>
  path.split("/").filter(Boolean).map(encodeURIComponent).join("/");

// --- ナビゲーションパス（React Router 用） ---

export const chatPath = (repoId: string) =>
  `/${encodeURIComponent(repoId)}/chat`;

export const chatSessionPath = (repoId: string, sessionId: string) =>
  `/${encodeURIComponent(repoId)}/chat/${encodeURIComponent(sessionId)}`;

export const filesPath = (repoId: string, subPath = "") => {
  const encoded = encodeFilePath(subPath);
  return encoded
    ? `/${encodeURIComponent(repoId)}/files/${encoded}`
    : `/${encodeURIComponent(repoId)}/files`;
};

export const gitPath = (repoId: string) =>
  `/${encodeURIComponent(repoId)}/git`;

/** ファイルタブのパスが現在のリポジトリのものか検証するためのプレフィックス */
export const repoNavPrefix = (repoId: string) =>
  `/${encodeURIComponent(repoId)}/`;

// --- API パス ---

export const apiSessionsPath = (repoId: string) =>
  `/api/sessions/${encodeURIComponent(repoId)}`;

export const apiSessionMessagesPath = (repoId: string, sessionId: string) =>
  `/api/sessions/${encodeURIComponent(repoId)}/${encodeURIComponent(sessionId)}/messages`;

export const apiFilesPath = (repoId: string, dirPath = "") => {
  const base = `/api/repos/${encodeURIComponent(repoId)}/files`;
  if (!dirPath) return base;
  const encoded = encodeFilePath(dirPath);
  return encoded ? `${base}?dir=${encoded}` : base;
};

export const apiFilePath = (repoId: string, filePath: string) =>
  `/api/repos/${encodeURIComponent(repoId)}/file/${encodeFilePath(filePath)}`;

export const apiRawPath = (repoId: string, filePath: string) =>
  `/api/repos/${encodeURIComponent(repoId)}/raw/${encodeFilePath(filePath)}`;

export const apiGitBase = (repoId: string) =>
  `/api/repos/${encodeURIComponent(repoId)}/git`;

export const apiGitShowPath = (repoId: string, hash: string) =>
  `${apiGitBase(repoId)}/show?commit=${encodeURIComponent(hash)}`;

export const apiGitDiffPath = (repoId: string, file: string) =>
  `${apiGitBase(repoId)}/diff?file=${encodeURIComponent(file)}`;
