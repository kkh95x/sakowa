import { Badge, type BadgeTone } from "@/components/ui/badge";
import { canonicalizeStatus, complaintStatusLabel } from "@/lib/orders/complaint-status";

const STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: "warning",
  REVIEWING: "info",
  IN_PROGRESS: "accent",
  RESOLVED: "success",
  REJECTED: "danger",
  CLOSED: "neutral",
};

export function statusTone(status: unknown): BadgeTone {
  return STATUS_TONE[canonicalizeStatus(status)] ?? "neutral";
}

export function StatusBadge({ status, className }: { status: unknown; className?: string }) {
  return (
    <Badge tone={statusTone(status)} dot className={className}>
      {complaintStatusLabel(status)}
    </Badge>
  );
}
