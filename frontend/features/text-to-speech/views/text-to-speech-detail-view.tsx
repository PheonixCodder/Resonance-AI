"use client";

import { useEffect, useState } from "react";
import {
  useQueryClient,
  useSuspenseQueries,
  useQuery,
} from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import { TextInputPanel } from "@/features/text-to-speech/components/text-input-panel";
import { SettingsPanel } from "@/features/text-to-speech/components/settings-panel";
import {
  TextToSpeechForm,
  type TTSFormValues,
} from "@/features/text-to-speech/components/text-to-speech-form";
import { TTSVoicesProvider } from "../contexts/tts-voices-context";
import { VoicePreviewPanel } from "../components/voice-preview-panel";
import { VoicePreviewMobile } from "../components/voice-preview-mobile";
import { GenerationProgress } from "../components/generation-progress";
import {
  readGenerationRealtimeAccess,
  clearGenerationRealtimeAccess,
  type GenerationRealtimeAccess,
} from "../lib/generation-realtime";
import { isGenerationInProgress } from "../lib/generation-status";
import { GenerationStatus } from "@/lib/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { getGenerationStatusLabel } from "../lib/generation-status";

export function TextToSpeechDetailView({
  generationId,
}: {
  generationId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [realtimeAccess, setRealtimeAccess] =
    useState<GenerationRealtimeAccess | null>(null);

  const [generationQuery, voicesQuery] = useSuspenseQueries({
    queries: [
      trpc.generations.getById.queryOptions({ id: generationId }),
      trpc.voices.getAll.queryOptions(),
    ],
  });

  const data = generationQuery.data;
  const { custom: customVoices, system: systemVoices } = voicesQuery.data;
  const allVoices = [...customVoices, ...systemVoices];

  useEffect(() => {
    setRealtimeAccess(readGenerationRealtimeAccess(generationId));
  }, [generationId]);

  const shouldFetchRunAccess =
    isGenerationInProgress(data.status) && !realtimeAccess;

  const runAccessQuery = useQuery({
    ...trpc.generations.getRunAccess.queryOptions({ id: generationId }),
    enabled: shouldFetchRunAccess,
  });

  const activeRealtimeAccess =
    realtimeAccess ??
    (runAccessQuery.data
      ? {
          triggerRunId: runAccessQuery.data.triggerRunId,
          publicAccessToken: runAccessQuery.data.publicAccessToken,
        }
      : null);

  const handleGenerationComplete = () => {
    clearGenerationRealtimeAccess(generationId);
    setRealtimeAccess(null);
    void queryClient.invalidateQueries({
      queryKey: trpc.generations.getById.queryKey({ id: generationId }),
    });
    void queryClient.invalidateQueries({
      queryKey: trpc.generations.getAll.queryKey(),
    });
  };

  const fallbackVoiceId = allVoices[0]?.id ?? "";

  const resolvedVoiceId =
    data?.voiceId && allVoices.some((v) => v.id === data.voiceId)
      ? data.voiceId
      : fallbackVoiceId;

  const defaultValues: TTSFormValues = {
    text: data.text,
    voiceId: resolvedVoiceId,
    temperature: data.temperature,
    topP: data.topP,
    topK: data.topK,
    repetitionPenalty: data.repetitionPenalty,
  };

  const generationVoice = {
    id: data.voiceId ?? undefined,
    name: data.voiceName,
  };

  const isReady = data.status === GenerationStatus.COMPLETED && !!data.audioUrl;
  const isFailed = data.status === GenerationStatus.FAILED;
  const isInProgress = isGenerationInProgress(data.status);

  return (
    <TTSVoicesProvider value={{ customVoices, systemVoices, allVoices }}>
      <TextToSpeechForm key={generationId} defaultValues={defaultValues}>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col">
            <TextInputPanel />
            {isFailed ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <Badge variant="destructive">
                  {getGenerationStatusLabel(data.status)}
                </Badge>
                <p className="max-w-md text-sm text-muted-foreground">
                  {data.errorMessage ?? "Generation failed. Please try again."}
                </p>
              </div>
            ) : isInProgress && activeRealtimeAccess ? (
              <GenerationProgress
                triggerRunId={activeRealtimeAccess.triggerRunId}
                publicAccessToken={activeRealtimeAccess.publicAccessToken}
                onComplete={handleGenerationComplete}
              />
            ) : isInProgress ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <Badge variant="outline">
                  {getGenerationStatusLabel(data.status)}
                </Badge>
                <p className="max-w-md text-xs text-muted-foreground">
                  Your audio is still generating. Refresh this page in a moment.
                </p>
              </div>
            ) : isReady ? (
              <>
                <VoicePreviewMobile
                  audioUrl={data.audioUrl!}
                  voice={generationVoice}
                  text={data.text}
                />
                <VoicePreviewPanel
                  audioUrl={data.audioUrl!}
                  voice={generationVoice}
                  text={data.text}
                />
              </>
            ) : null}
          </div>
          <SettingsPanel />
        </div>
      </TextToSpeechForm>
    </TTSVoicesProvider>
  );
}
