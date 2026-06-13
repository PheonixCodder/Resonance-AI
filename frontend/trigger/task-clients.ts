import createClient from "openapi-fetch";
import { Polar } from "@polar-sh/sdk";

import type { paths } from "@/types/chatterbox-api";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function getTaskChatterbox() {
  return createClient<paths>({
    baseUrl: requireEnv("CHATTERBOX_API_URL"),
    headers: {
      "x-api-key": requireEnv("CHATTERBOX_API_KEY"),
    },
  });
}

export function getTaskPolar() {
  const server = process.env.POLAR_SERVER;
  return new Polar({
    accessToken: requireEnv("POLAR_ACCESS_TOKEN"),
    server: server === "production" ? "production" : "sandbox",
  });
}

export function getPolarMeterConfig() {
  return {
    ttsGeneration: requireEnv("POLAR_METER_TTS_GENERATION"),
    ttsProperty: requireEnv("POLAR_METER_TTS_PROPERTY"),
  };
}
