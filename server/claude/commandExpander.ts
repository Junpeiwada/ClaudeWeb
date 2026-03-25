import { readFile, readdir } from "fs/promises";
import { join } from "path";

/**
 * .claude/commands/ 配下のカスタムスラッシュコマンドを展開する。
 * "/post 引数..." → post.md の内容で $ARGUMENTS を置換して返す。
 */

const SLASH_CMD_RE = /^\/([a-zA-Z0-9_-]+)\s*([\s\S]*)$/;

export interface ExpandResult {
  expanded: boolean;
  prompt: string;
}

export async function expandSlashCommand(
  message: string,
  repoPath: string
): Promise<ExpandResult> {
  const match = message.match(SLASH_CMD_RE);
  if (!match) {
    return { expanded: false, prompt: message };
  }

  const commandName = match[1];
  const args = match[2].trim();

  const commandFile = join(repoPath, ".claude", "commands", `${commandName}.md`);

  try {
    const template = await readFile(commandFile, "utf-8");
    const prompt = template.replace(/\$ARGUMENTS/g, args);
    return { expanded: true, prompt };
  } catch {
    // コマンドファイルが見つからない場合はそのまま返す
    return { expanded: false, prompt: message };
  }
}
