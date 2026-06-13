import { task, metadata, AbortTaskRunError } from "@trigger.dev/sdk";

import prisma from "@/lib/prisma";
import { GenerationStatus } from "@/lib/generated/prisma/enums";
import { uploadTaskAudio } from "./r2-upload";
import {
  getPolarMeterConfig,
  getTaskChatterbox,
  getTaskPolar,
} from "./task-clients";

export type GenerateSpeechPayload = {
  generationId: string;
  orgId: string;
  voiceR2Key: string;
  prompt: string;
  temperature: number;
  topP: number;
  topK: number;
  repetitionPenalty: number;
  textLength: number;
};

export const generateSpeechTask = task({
  id: "generate-speech",
  maxDuration: 900,
  retry: {
    maxAttempts: 2,
    factor: 1.8,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: GenerateSpeechPayload) => {
    metadata.set("stage", "starting");

    const existing = await prisma.generation.findUnique({
      where: { id: payload.generationId },
      select: { status: true, orgId: true },
    });

    if (!existing || existing.orgId !== payload.orgId) {
      throw new AbortTaskRunError("Generation not found");
    }

    if (existing.status === GenerationStatus.COMPLETED) {
      metadata.set("stage", "completed");
      return { generationId: payload.generationId, skipped: true };
    }

    await prisma.generation.update({
      where: { id: payload.generationId },
      data: { status: GenerationStatus.PROCESSING, errorMessage: null },
    });

    metadata.set("stage", "calling_modal");

    const chatterbox = getTaskChatterbox();
    const { data, error, response } = await chatterbox.POST("/generate", {
      body: {
        prompt: payload.prompt,
        voice_key: payload.voiceR2Key,
        temperature: payload.temperature,
        top_p: payload.topP,
        top_k: payload.topK,
        repetition_penalty: payload.repetitionPenalty,
        norm_loudness: true,
      },
      parseAs: "arrayBuffer",
    });

    if (error || !(data instanceof ArrayBuffer)) {
      const status = response?.status ?? 500;
      const message =
        status === 400 || status === 403
          ? "Voice reference audio is unavailable"
          : "Failed to generate audio";

      await prisma.generation.update({
        where: { id: payload.generationId },
        data: {
          status: GenerationStatus.FAILED,
          errorMessage: message,
        },
      });

      metadata.set("stage", "failed");

      if (status === 400 || status === 403) {
        throw new AbortTaskRunError(message);
      }

      throw new Error(message);
    }

    metadata.set("stage", "uploading");

    const r2ObjectKey = `generations/orgs/${payload.orgId}/${payload.generationId}`;

    try {
      await uploadTaskAudio({
        buffer: Buffer.from(data),
        key: r2ObjectKey,
      });

      await prisma.generation.update({
        where: { id: payload.generationId },
        data: {
          status: GenerationStatus.COMPLETED,
          r2ObjectKey,
          errorMessage: null,
        },
      });
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "Failed to store generated audio";

      await prisma.generation.update({
        where: { id: payload.generationId },
        data: {
          status: GenerationStatus.FAILED,
          errorMessage: message,
        },
      });

      metadata.set("stage", "failed");
      throw new Error(message);
    }

    metadata.set("stage", "completed");

    const polar = getTaskPolar();
    const meters = getPolarMeterConfig();

    polar.events
      .ingest({
        events: [
          {
            name: meters.ttsGeneration,
            externalCustomerId: payload.orgId,
            metadata: { [meters.ttsProperty]: payload.textLength },
            timestamp: new Date(),
          },
        ],
      })
      .catch(() => {});

    return { generationId: payload.generationId };
  },
});
