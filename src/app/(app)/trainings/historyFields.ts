import type { HistoryFields } from "@/components/HistoryPanel";
import { formatDate, formatMoney } from "@/lib/format";
import { OJT_METHOD_LABELS, TRAINING_FUNCTION_LABELS, TRAINING_PLATFORM_LABELS, TRAINING_PROGRAM_LABELS, TRAINING_TYPE_LABELS } from "@/lib/validation/training";

/** Looks a stored code up in a label map, falling back to the code itself. */
const label = (map: Record<string, string>) => (v: unknown) => map[String(v)] ?? String(v);
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? formatDate(new Date(`${v}T00:00:00Z`)) : String(v));

/** Training audit entries in the words the form uses. */
export const TRAINING_HISTORY_FIELDS: HistoryFields = {
  type: { label: "Type", format: label(TRAINING_TYPE_LABELS) },
  title: { label: "Title" },
  venue: { label: "Venue" },
  cost: { label: "Cost", format: (v) => formatMoney(String(v)) },
  hrdfClaimable: { label: "HRDC", format: (v) => (v === true || v === "true" ? "Yes" : "No") },
  platform: { label: "Platform", format: label(TRAINING_PLATFORM_LABELS) },
  function: { label: "Function", format: label(TRAINING_FUNCTION_LABELS) },
  startDate: { label: "Start date", format: date },
  endDate: { label: "End date", format: date },
  startTime: { label: "Start time" },
  endTime: { label: "End time" },
  program: { label: "Program", format: label(TRAINING_PROGRAM_LABELS) },
  ojtMethod: { label: "OJT type", format: label(OJT_METHOD_LABELS) },
  trainerName: { label: "Trainer" },
  trainerStaffId: { hidden: true }, // the trainer's name change already shows it
  status: { label: "Status", format: (v) => (v === "CANCELLED" ? "Cancelled" : "Scheduled") },
  sessions: { label: "Sessions" },
  // Participant entries
  attendance: { label: "Attendance" },
  reason: { label: "Reason" },
  reasonGiven: { label: "Reason", listing: true }, // one reason for several people
  staff: { label: "Staff", listing: true }, // who an add or a bulk action covered
};
