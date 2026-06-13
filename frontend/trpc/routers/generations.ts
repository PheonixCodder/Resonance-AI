import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { auth, tasks } from "@trigger.dev/sdk";
import type { generateSpeechTask } from "@/trigger/generate-speech";
import { polar } from "@/lib/polar";
import { TRPCError } from "@trpc/server";
import prisma from "@/lib/prisma";
import { GenerationStatus } from "@/lib/generated/prisma/enums";
import { TEXT_MAX_LENGTH } from "@/features/text-to-speech/data/constants";
import { createTRPCRouter, orgProcedure } from "../init";

export const generationsRouter = createTRPCRouter({
  getById: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const generation = await prisma.generation.findUnique({
        where: { id: input.id, orgId: ctx.orgId },
        omit: {
          orgId: true,
          r2ObjectKey: true,
        },
      });

      if (!generation) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return {
        ...generation,
        audioUrl:
          generation.status === GenerationStatus.COMPLETED
            ? `/api/audio/${generation.id}`
            : null,
      };
    }),

  getRunAccess: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const generation = await prisma.generation.findUnique({
        where: { id: input.id, orgId: ctx.orgId },
        select: {
          triggerRunId: true,
          status: true,
        },
      });

      if (!generation?.triggerRunId) {
        return null;
      }

      if (
        generation.status === GenerationStatus.COMPLETED ||
        generation.status === GenerationStatus.FAILED
      ) {
        return null;
      }

      const publicAccessToken = await auth.createPublicToken({
        scopes: {
          read: {
            runs: [generation.triggerRunId],
          },
        },
      });

      return {
        triggerRunId: generation.triggerRunId,
        publicAccessToken,
      };
    }),

  getAll: orgProcedure.query(async ({ ctx }) => {
    const generations = await prisma.generation.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      omit: {
        orgId: true,
        r2ObjectKey: true,
      },
    });

    return generations;
  }),

  create: orgProcedure
    .input(
      z.object({
        text: z.string().min(1).max(TEXT_MAX_LENGTH),
        voiceId: z.string().min(1),
        temperature: z.number().min(0).max(2).default(0.8),
        topP: z.number().min(0).max(1).default(0.95),
        topK: z.number().min(1).max(10000).default(1000),
        repetitionPenalty: z.number().min(1).max(2).default(1.2),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const customerState = await polar.customers.getStateExternal({
          externalId: ctx.orgId,
        });
        const hasActiveSubscription =
          (customerState.activeSubscriptions ?? []).length > 0;
        if (!hasActiveSubscription) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "SUBSCRIPTION_REQUIRED",
          });
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "SUBSCRIPTION_REQUIRED",
        });
      }

      const voice = await prisma.voice.findUnique({
        where: {
          id: input.voiceId,
          OR: [{ variant: "SYSTEM" }, { variant: "CUSTOM", orgId: ctx.orgId }],
        },
        select: {
          id: true,
          name: true,
          r2ObjectKey: true,
        },
      });

      if (!voice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Voice not found",
        });
      }

      if (!voice.r2ObjectKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Voice audio not available",
        });
      }

      const generation = await prisma.generation.create({
        data: {
          orgId: ctx.orgId,
          text: input.text,
          voiceName: voice.name,
          voiceId: voice.id,
          temperature: input.temperature,
          topP: input.topP,
          topK: input.topK,
          repetitionPenalty: input.repetitionPenalty,
          status: GenerationStatus.PENDING,
        },
        select: {
          id: true,
        },
      });

      const handle = await tasks.trigger<typeof generateSpeechTask>(
        "generate-speech",
        {
          generationId: generation.id,
          orgId: ctx.orgId,
          voiceR2Key: voice.r2ObjectKey,
          prompt: input.text,
          temperature: input.temperature,
          topP: input.topP,
          topK: input.topK,
          repetitionPenalty: input.repetitionPenalty,
          textLength: input.text.length,
        },
        {
          idempotencyKey: generation.id,
          tags: [`org:${ctx.orgId}`, `generation:${generation.id}`],
        },
      );

      await prisma.generation.update({
        where: { id: generation.id },
        data: { triggerRunId: handle.id },
      });

      Sentry.logger.info("Generation enqueued", {
        orgId: ctx.orgId,
        generationId: generation.id,
        triggerRunId: handle.id,
        voiceId: input.voiceId,
        textLength: input.text.length,
      });

      return {
        id: generation.id,
        triggerRunId: handle.id,
        publicAccessToken: handle.publicAccessToken,
      };
    }),
});
