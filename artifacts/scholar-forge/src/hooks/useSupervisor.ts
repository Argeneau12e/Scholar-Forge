import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "sf_supervisor_config";

export interface SupervisorConfig {
  yearFrom: number;
  yearTo: number;
  citationStyle: string;
  discipline: string;
  preferredJournals: string[];
  maxFigures: number;
  universityName: string;
}

export const CITATION_STYLES = [
  "APA 7th",
  "Vancouver",
  "Harvard",
  "MLA 9th",
  "Chicago 17th",
] as const;

export const DISCIPLINES = [
  "Biomedical",
  "Social Sciences",
  "Humanities",
  "Law",
  "Engineering",
  "Other",
] as const;

export const DEFAULT_CONFIG: SupervisorConfig = {
  yearFrom: 2020,
  yearTo: 2025,
  citationStyle: "APA 7th",
  discipline: "Biomedical",
  preferredJournals: [],
  maxFigures: 5,
  universityName: "",
};

function readFromStorage(): SupervisorConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SupervisorConfig;
  } catch {
    return null;
  }
}

function writeToStorage(config: SupervisorConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function useSupervisor() {
  const [config, setConfig] = useState<SupervisorConfig | null>(() => readFromStorage());

  useEffect(() => {
    const handleStorage = () => {
      setConfig(readFromStorage());
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const updateConfig = useCallback((next: SupervisorConfig) => {
    writeToStorage(next);
    setConfig(next);
  }, []);

  const skipWithDefaults = useCallback(() => {
    writeToStorage(DEFAULT_CONFIG);
    setConfig(DEFAULT_CONFIG);
  }, []);

  const checkYearCompliance = useCallback(
    (year: number | null | undefined): { compliant: boolean; message: string } => {
      if (!config) {
        return { compliant: true, message: "" };
      }
      if (year == null) {
        return { compliant: false, message: "Publication year unknown" };
      }
      if (year < config.yearFrom || year > config.yearTo) {
        return {
          compliant: false,
          message: `Outside allowed range ${config.yearFrom}–${config.yearTo}`,
        };
      }
      return { compliant: true, message: `Within ${config.yearFrom}–${config.yearTo}` };
    },
    [config]
  );

  const checkJournalCompliance = useCallback(
    (journal: string | null | undefined): { compliant: boolean; message: string } => {
      if (!config || config.preferredJournals.length === 0) {
        return { compliant: true, message: "" };
      }
      if (!journal) {
        return { compliant: false, message: "No venue listed" };
      }
      const normalised = journal.toLowerCase();
      const match = config.preferredJournals.some((j) =>
        normalised.includes(j.toLowerCase())
      );
      if (match) {
        return { compliant: true, message: "Preferred journal" };
      }
      return {
        compliant: false,
        message: "Not in preferred journal list",
      };
    },
    [config]
  );

  return {
    config,
    updateConfig,
    skipWithDefaults,
    checkYearCompliance,
    checkJournalCompliance,
  };
}
