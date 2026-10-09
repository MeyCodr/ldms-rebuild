"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select";

/** The cost chart's own year: picking one redraws the chart for that year, whatever the dates above say. */
export function CostYear({ years, year }: { years: number[]; year: number | null }) {
  const router = useRouter();
  const search = useSearchParams();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="costYear" className="text-[12.5px] text-ink-3">
        Year
      </label>
      <Select
        id="costYear"
        name="costYear"
        className="w-40"
        value={year ? String(year) : ""}
        options={[{ value: "", label: "Dates above" }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
        onChange={(value) => {
          const params = new URLSearchParams(search);
          if (value) params.set("costYear", value);
          else params.delete("costYear");
          const query = params.toString();
          router.push(`/dashboard${query ? `?${query}` : ""}`, { scroll: false });
        }}
      />
    </div>
  );
}
