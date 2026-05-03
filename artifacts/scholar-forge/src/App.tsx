import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Supervisors from "@/pages/supervisors";
import CollectionPage from "@/pages/collection";
import CoachPage from "@/pages/coach";
import VisualsPage from "@/pages/visuals";
import OriginalityPage from "@/pages/originality";
import QuestionPage from "@/pages/question";
import PaperGraphPage from "@/pages/papergraph";
import WritingStudioPage from "@/pages/studio";
import OutlinePage from "@/pages/outline";
import JournalsPage from "@/pages/journals";
import { Layout } from "@/components/layout";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/supervisors" component={Supervisors} />
        <Route path="/collection" component={CollectionPage} />
        <Route path="/coach" component={CoachPage} />
        <Route path="/visuals" component={VisualsPage} />
        <Route path="/originality" component={OriginalityPage} />
        <Route path="/question" component={QuestionPage} />
        <Route path="/papergraph" component={PaperGraphPage} />
        <Route path="/studio" component={WritingStudioPage} />
        <Route path="/outline" component={OutlinePage} />
        <Route path="/journals" component={JournalsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
