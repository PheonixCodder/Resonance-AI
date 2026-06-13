import { GenerationStatus } from "@/lib/generated/prisma/enums";

const STATUS_LABELS: Record<GenerationStatus, string> = {
  [GenerationStatus.PENDING]: "Pending",
  [GenerationStatus.PROCESSING]: "Generating",
  [GenerationStatus.COMPLETED]: "Ready",
  [GenerationStatus.FAILED]: "Failed",
};

export function getGenerationStatusLabel(status: GenerationStatus) {
  return STATUS_LABELS[status];
}

export function isGenerationInProgress(status: GenerationStatus) {
  return (
    status === GenerationStatus.PENDING || status === GenerationStatus.PROCESSING
  );
}
