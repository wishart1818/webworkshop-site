import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.platform === "win32" ? "prisma.cmd" : "prisma",
  ["validate"],
  {
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://schema_validation:schema_validation@127.0.0.1:5432/schema_validation",
    },
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

process.exit(result.status ?? 1);
