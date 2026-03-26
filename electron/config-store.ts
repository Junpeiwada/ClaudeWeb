import { app } from "electron";
import path from "path";
import fs from "fs";

export interface AppConfig {
  baseProjectDir: string;
  port: number;
  autoStartServer: boolean;
  windowBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

const defaults: AppConfig = {
  baseProjectDir: "",
  port: 3000,
  autoStartServer: true,
};

function getConfigPath(): string {
  return path.join(app.getPath("userData"), "config.json");
}

function readConfig(): AppConfig {
  try {
    const data = fs.readFileSync(getConfigPath(), "utf-8");
    return { ...defaults, ...JSON.parse(data) };
  } catch {
    return { ...defaults };
  }
}

function writeConfig(config: AppConfig): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function getConfig(): AppConfig {
  return readConfig();
}

export function setConfig(partial: Partial<AppConfig>): void {
  const current = readConfig();
  const updated = { ...current, ...partial };
  writeConfig(updated);
}
