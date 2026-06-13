const STORAGE_PREFIX = "generation-realtime:";

export type GenerationRealtimeAccess = {
  triggerRunId: string;
  publicAccessToken: string;
};

export function saveGenerationRealtimeAccess(
  generationId: string,
  access: GenerationRealtimeAccess,
) {
  sessionStorage.setItem(`${STORAGE_PREFIX}${generationId}`, JSON.stringify(access));
}

export function readGenerationRealtimeAccess(
  generationId: string,
): GenerationRealtimeAccess | null {
  const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${generationId}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as GenerationRealtimeAccess;
  } catch {
    return null;
  }
}

export function clearGenerationRealtimeAccess(generationId: string) {
  sessionStorage.removeItem(`${STORAGE_PREFIX}${generationId}`);
}
