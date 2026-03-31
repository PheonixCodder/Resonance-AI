import { Loader2Icon } from "lucide-react";

type LoadingStateProps = {
  message?: string;
};

export const LoadingState = ({ message = "Loading..." }: LoadingStateProps) => (
  <div className="py-4 px-8 flex flex-1 items-center justify-center">
    <div className="flex flex-col items-center justify-center gap-y-6 bg-background rounded-lg p-10 shadow-sm">
      <Loader2Icon className="size-6 animate-spin text-blue-500" />
      <div className="flex flex-col gap-y-2 text-center">
        <div className="text-lg font-medium">{message}</div>
      </div>
    </div>
  </div>
);
