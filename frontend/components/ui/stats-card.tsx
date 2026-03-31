import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
}

export function StatsCard({
  title,
  value,
  icon,
  trend,
  trendUp = true,
}: StatsCardProps) {
  return (
    <div className="bg-white rounded-xl border p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-600">
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        {trend && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs",
              trendUp ? "text-green-600" : "text-red-600"
            )}
          >
            {trendUp ? (
              <ArrowUpRight size={14} />
            ) : (
              <ArrowDownRight size={14} />
            )}
            {trend}
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="text-3xl font-bold text-slate-900">{value}</div>
      </div>
    </div>
  );
}
