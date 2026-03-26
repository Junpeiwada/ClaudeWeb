import "dotenv/config";

// コマンドライン引数を解析（Electron fork時に使用）
function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

const dir = getArg("base-dir") || process.env.BASE_PROJECT_DIR;
if (!dir) {
  console.error("Error: BASE_PROJECT_DIR environment variable is required.");
  console.error("Create a .env file with: BASE_PROJECT_DIR=/path/to/your/projects");
  process.exit(1);
}

export const BASE_DIR: string = dir;
