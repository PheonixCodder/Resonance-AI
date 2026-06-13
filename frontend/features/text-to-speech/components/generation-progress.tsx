"use client";

import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { generateSpeechTask } from "@/trigger/generate-speech";

const STAGE_LABELS: Record<string, string> = {
  starting: "Starting generation...",
  calling_modal: "Generating speech on GPU...",
  uploading: "Saving audio...",
  completed: "Generation complete",
  failed: "Generation failed",
};

function getStageLabel(stage: string | undefined, runStatus: string | undefined) {
  if (stage && STAGE_LABELS[stage]) {
    return STAGE_LABELS[stage];
  }

  if (runStatus === "QUEUED" || runStatus === "WAITING") {
    return "Queued for generation...";
  }

  if (runStatus === "EXECUTING" || runStatus === "REATTEMPTING") {
    return "Generating speech...";
  }

  return "Preparing generation...";
}

export function GenerationProgress({
  triggerRunId,
  publicAccessToken,
  onComplete,
}: {
  triggerRunId: string;
  publicAccessToken: string;
  onComplete: () => void;
}) {
  const { run, error } = useRealtimeRun<typeof generateSpeechTask>(triggerRunId, {
    accessToken: publicAccessToken,
    skipColumns: ["payload", "output"],
    onComplete: () => onComplete(),
  });

  if (error) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-medium text-destructive">
          Could not load live generation status
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {error.message}
        </p>
      </div>
    );
  }

  const stage = run?.metadata?.stage as string | undefined;
  const label = getStageLabel(stage, run?.status);

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <Badge
        variant="outline"
        className="gap-2 bg-background/90 px-4 py-2 text-sm text-muted-foreground shadow-sm"
      >
        <Loader2 className="size-4 animate-spin" />
        <span>{label}</span>
      </Badge>
      <p className="max-w-md text-xs text-muted-foreground">
        This can take up to a few minutes on the first request while the GPU
        warms up. You can leave this page and come back later.
      </p>
    </div>
  );
}
