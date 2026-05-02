import { ReactNode } from "react";
import { TopNav } from "./top-nav";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background font-sans text-foreground">
      <TopNav />
      <div className="flex-1 flex overflow-hidden h-[calc(100vh-3.5rem)]">
        {children}
      </div>
    </div>
  );
}
