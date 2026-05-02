import { useState } from "react";
import { useSupervisor } from "@/hooks/useSupervisor";
import { SupervisorSetup } from "./SupervisorSetup";
import { CalendarRange, Quote, FlaskConical } from "lucide-react";

const PILL_BASE =
  "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-opacity hover:opacity-75 select-none";

const PILL_GREEN = "bg-emerald-100 text-emerald-800 border border-emerald-200";
const PILL_BLUE = "bg-sky-100 text-sky-800 border border-sky-200";
const PILL_PURPLE = "bg-violet-100 text-violet-800 border border-violet-200";

export function SupervisorBar() {
  const { config } = useSupervisor();
  const [setupOpen, setSetupOpen] = useState(false);

  if (!config) return null;

  return (
    <>
      <div
        className="w-full border-b border-border/50 bg-background/70 backdrop-blur-sm"
        data-testid="supervisor-bar"
      >
        <div className="flex items-center gap-2 px-6 py-1.5 flex-wrap">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mr-1">
            Active constraints
          </span>

          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className={`${PILL_BASE} ${PILL_GREEN}`}
            title="Click to edit supervisor settings"
            data-testid="pill-year-range"
          >
            <CalendarRange className="h-3 w-3" />
            {config.yearFrom}–{config.yearTo}
          </button>

          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className={`${PILL_BASE} ${PILL_BLUE}`}
            title="Click to edit supervisor settings"
            data-testid="pill-citation-style"
          >
            <Quote className="h-3 w-3" />
            {config.citationStyle}
          </button>

          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className={`${PILL_BASE} ${PILL_PURPLE}`}
            title="Click to edit supervisor settings"
            data-testid="pill-discipline"
          >
            <FlaskConical className="h-3 w-3" />
            {config.discipline}
          </button>

          {config.universityName && (
            <span className="text-[10px] text-muted-foreground/50 ml-auto">
              {config.universityName}
            </span>
          )}
        </div>
      </div>

      <SupervisorSetup open={setupOpen} onOpenChange={setSetupOpen} />
    </>
  );
}
