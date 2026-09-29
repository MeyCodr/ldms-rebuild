// Status is a small dot plus words, never a filled badge. Colour carries
// meaning only: ok (done / active), wait (someone must act), bad (stopped),
// na (not applicable).

type Tone = "ok" | "wait" | "bad" | "na";

const DOT: Record<Tone, string> = {
  ok: "bg-ok",
  wait: "bg-wait",
  bad: "bg-bad",
  na: "bg-na",
};

export function Status({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className={`inline-block size-1.5 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}

export function StaffStatus({ status }: { status: "ACTIVE" | "RESIGNED" }) {
  return status === "ACTIVE" ? <Status tone="ok">Active</Status> : <Status tone="na">Resigned</Status>;
}
