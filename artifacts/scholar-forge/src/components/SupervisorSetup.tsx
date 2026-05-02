import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSupervisor,
  CITATION_STYLES,
  DISCIPLINES,
  DEFAULT_CONFIG,
  type SupervisorConfig,
} from "@/hooks/useSupervisor";
import { GraduationCap } from "lucide-react";

interface FormValues {
  yearFrom: string;
  yearTo: string;
  citationStyle: string;
  discipline: string;
  preferredJournals: string;
  maxFigures: string;
  universityName: string;
}

interface SupervisorSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupervisorSetup({ open, onOpenChange }: SupervisorSetupProps) {
  const { config, updateConfig, skipWithDefaults } = useSupervisor();

  const { register, handleSubmit, control, reset } = useForm<FormValues>({
    defaultValues: {
      yearFrom: String((config ?? DEFAULT_CONFIG).yearFrom),
      yearTo: String((config ?? DEFAULT_CONFIG).yearTo),
      citationStyle: (config ?? DEFAULT_CONFIG).citationStyle,
      discipline: (config ?? DEFAULT_CONFIG).discipline,
      preferredJournals: (config ?? DEFAULT_CONFIG).preferredJournals.join(", "),
      maxFigures: String((config ?? DEFAULT_CONFIG).maxFigures),
      universityName: (config ?? DEFAULT_CONFIG).universityName,
    },
  });

  useEffect(() => {
    if (open && config) {
      reset({
        yearFrom: String(config.yearFrom),
        yearTo: String(config.yearTo),
        citationStyle: config.citationStyle,
        discipline: config.discipline,
        preferredJournals: config.preferredJournals.join(", "),
        maxFigures: String(config.maxFigures),
        universityName: config.universityName,
      });
    }
  }, [open, config, reset]);

  const onSubmit = (values: FormValues) => {
    const next: SupervisorConfig = {
      yearFrom: parseInt(values.yearFrom, 10) || DEFAULT_CONFIG.yearFrom,
      yearTo: parseInt(values.yearTo, 10) || DEFAULT_CONFIG.yearTo,
      citationStyle: values.citationStyle || DEFAULT_CONFIG.citationStyle,
      discipline: values.discipline || DEFAULT_CONFIG.discipline,
      preferredJournals: values.preferredJournals
        ? values.preferredJournals
            .split(",")
            .map((j) => j.trim())
            .filter(Boolean)
        : [],
      maxFigures: parseInt(values.maxFigures, 10) || DEFAULT_CONFIG.maxFigures,
      universityName: values.universityName.trim(),
    };
    updateConfig(next);
    onOpenChange(false);
  };

  const handleSkip = () => {
    skipWithDefaults();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[520px] gap-0 p-0 overflow-hidden"
        data-testid="dialog-supervisor-setup"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60 bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="font-serif text-xl text-foreground">
                Supervisor Mode
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                Set your research constraints for this session.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="yearFrom" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Year range — From
              </Label>
              <Input
                id="yearFrom"
                type="number"
                min={1900}
                max={2099}
                {...register("yearFrom")}
                className="rounded-[6px]"
                data-testid="input-year-from"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="yearTo" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                To
              </Label>
              <Input
                id="yearTo"
                type="number"
                min={1900}
                max={2099}
                {...register("yearTo")}
                className="rounded-[6px]"
                data-testid="input-year-to"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Citation Style
              </Label>
              <Controller
                control={control}
                name="citationStyle"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="rounded-[6px]" data-testid="select-citation-style">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CITATION_STYLES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Discipline
              </Label>
              <Controller
                control={control}
                name="discipline"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="rounded-[6px]" data-testid="select-discipline">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DISCIPLINES.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="preferredJournals" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Preferred Journals{" "}
              <span className="normal-case text-muted-foreground/60 font-normal">(optional — comma-separated)</span>
            </Label>
            <Input
              id="preferredJournals"
              placeholder="e.g. Nature, Lancet, NEJM"
              {...register("preferredJournals")}
              className="rounded-[6px]"
              data-testid="input-preferred-journals"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="maxFigures" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Max Figures
              </Label>
              <Input
                id="maxFigures"
                type="number"
                min={0}
                max={100}
                {...register("maxFigures")}
                className="rounded-[6px]"
                data-testid="input-max-figures"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="universityName" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                University Name{" "}
                <span className="normal-case text-muted-foreground/60 font-normal">(optional)</span>
              </Label>
              <Input
                id="universityName"
                placeholder="e.g. MIT"
                {...register("universityName")}
                className="rounded-[6px]"
                data-testid="input-university-name"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={handleSkip}
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
              data-testid="button-skip-supervisor"
            >
              Skip for now
            </button>
            <Button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="button-save-supervisor"
            >
              Save constraints
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SupervisorSetupTrigger() {
  const { config } = useSupervisor();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (config === null) {
      setOpen(true);
    }
  }, [config]);

  return <SupervisorSetup open={open} onOpenChange={setOpen} />;
}
