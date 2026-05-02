import { ReactNode } from "react";
import { TopNav } from "./top-nav";
import { SupervisorBar } from "./SupervisorBar";
import { SupervisorSetupTrigger } from "./SupervisorSetup";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background font-sans text-foreground">
      <SupervisorSetupTrigger />
      <TopNav />
      <SupervisorBar />
      <div className="flex-1 flex overflow-hidden">
        {children}
      </div>
    </div>
  );
}
