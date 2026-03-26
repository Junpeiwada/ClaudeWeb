import "dotenv/config";

const dir = process.env.BASE_PROJECT_DIR;
if (!dir) {
  console.error("Error: BASE_PROJECT_DIR environment variable is required.");
  console.error("Create a .env file with: BASE_PROJECT_DIR=/path/to/your/projects");
  process.exit(1);
}

export const BASE_DIR: string = dir;
