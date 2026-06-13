import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { defineConfig } from "@trigger.dev/sdk";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

config({ path: ".env.local" });

const TASK_ENV_VARS = [
  "DATABASE_URL",
  "APP_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "CHATTERBOX_API_URL",
  "CHATTERBOX_API_KEY",
  "POLAR_ACCESS_TOKEN",
  "POLAR_SERVER",
  "POLAR_METER_TTS_GENERATION",
  "POLAR_METER_TTS_PROPERTY",
] as const;

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  dirs: ["./trigger"],
  maxDuration: 900,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      factor: 1.8,
    },
  },
  build: {
    extensions: [
      prismaExtension({
        mode: "modern",
      }),
      syncEnvVars(async () => {
        const envContent = readFileSync(".env.local", "utf-8");
        const parsed = Object.fromEntries(
          envContent
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith("#"))
            .map((line) => {
              const index = line.indexOf("=");
              return [line.slice(0, index), line.slice(index + 1)] as const;
            })
            .filter(([key]) =>
              TASK_ENV_VARS.includes(key as (typeof TASK_ENV_VARS)[number]),
            ),
        );

        return parsed;
      }),
    ],
  },
});
