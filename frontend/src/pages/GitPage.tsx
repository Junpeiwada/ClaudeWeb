import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Box, Snackbar, Alert, CircularProgress, useMediaQuery, useTheme } from "@mui/material";
import { useGitStatus } from "../hooks/useGitStatus";
import GitHeader from "../components/git/GitHeader";
import GitFileList from "../components/git/GitFileList";
import GitDiffView from "../components/git/GitDiffView";
import GitCommitBox from "../components/git/GitCommitBox";

export default function GitPage() {
  const { repo } = useParams<{ repo: string }>();
  const repoId = repo ?? "";
  const git = useGitStatus(repoId);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileDiffOpen, setMobileDiffOpen] = useState(false);

  // マウント時にステータス取得
  useEffect(() => {
    git.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId]);

  // ステータス取得後、未選択なら先頭ファイルを自動選択
  useEffect(() => {
    if (git.status && git.status.files.length > 0 && !git.selectedFile) {
      git.selectFile(git.status.files[0].path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [git.status]);

  // モバイルでファイル選択時にDiff画面へ切り替え
  const handleSelectFile = (file: string) => {
    git.selectFile(file);
    if (isMobile) {
      setMobileDiffOpen(true);
    }
  };

  const stagedCount = git.status?.files.filter((f) => f.staged).length ?? 0;

  if (git.loading && !git.status) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* ヘッダー: ブランチ + Fetch/Pull/Push */}
      <GitHeader
        status={git.status}
        loading={git.loading}
        operationLoading={git.operationLoading}
        onFetch={git.fetch}
        onPull={git.pull}
        onPush={git.push}
      />

      {/* メインエリア */}
      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* 左ペイン（ファイル一覧+コミット） */}
        <Box
          sx={(theme) => ({
            display: isMobile && mobileDiffOpen ? "none" : "flex",
            flexDirection: "column",
            width: { xs: "100%", md: "30%" },
            minWidth: { md: 240 },
            maxWidth: { md: 400 },
            borderRight: { md: `1px solid ${theme.palette.border}` },
          })}
        >
          <GitFileList
            files={git.status?.files ?? []}
            selectedFile={git.selectedFile}
            onSelectFile={handleSelectFile}
            onStage={git.stageFiles}
            onUnstage={git.unstageFiles}
          />
          <GitCommitBox
            message={git.commitMessage}
            onMessageChange={git.setCommitMessage}
            onCommit={git.commit}
            onUndoCommit={git.undoCommit}
            stagedCount={stagedCount}
            ahead={git.status?.ahead ?? 0}
            loading={git.operationLoading}
          />
        </Box>

        {/* 右ペイン（Diff） */}
        <Box
          sx={{
            display: isMobile && !mobileDiffOpen ? "none" : "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
          }}
        >
          <GitDiffView
            diff={git.diff}
            loading={git.diffLoading}
            selectedFile={git.selectedFile}
            onBack={isMobile ? () => setMobileDiffOpen(false) : undefined}
          />
        </Box>
      </Box>

      {/* エラー Snackbar */}
      <Snackbar
        open={!!git.error}
        autoHideDuration={5000}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity="error" variant="filled" sx={{ width: "100%" }}>
          {git.error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
