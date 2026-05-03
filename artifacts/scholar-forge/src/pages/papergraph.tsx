import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { Search, Loader2, AlertCircle, Star, ExternalLink, BookmarkPlus, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCollection } from "@/hooks/useCollection";
import { useToast } from "@/hooks/use-toast";

interface GraphNode {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  citedByCount: number;
  doi: string | null;
  url: string;
  venue: string | null;
  abstract: string | null;
  relationship: "seed" | "reference" | "related";
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  type: "cites" | "cited_by" | "related" | "co-citation";
}

interface GraphData {
  seed: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const REL_COLOR: Record<string, string> = {
  seed: "#f59e0b",
  reference: "#10b981",
  related: "#6366f1",
};

export default function PaperGraphPage() {
  const [doi, setDoi] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [yearRange, setYearRange] = useState<[number, number]>([1990, 2025]);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const { addRawSnippet } = useCollection();
  const { toast } = useToast();

  const fetchGraphFromParams = useCallback(async (doiParam?: string, titleParam?: string) => {
    const d = doiParam ?? doi.trim();
    const t = titleParam ?? title.trim();
    if (!d && !t) return;
    setLoading(true);
    setError(null);
    setGraph(null);
    setSelected(null);
    try {
      const res = await fetch("/api/papergraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doi: d || undefined, title: t || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not build graph");
      const data: GraphData = await res.json();
      const years = [data.seed, ...data.nodes].map((n) => n.year).filter((y): y is number => y !== null);
      if (years.length) setYearRange([Math.min(...years) - 1, Math.max(...years) + 1]);
      setGraph(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [doi, title]);

  // Auto-fetch from URL params (?doi= or ?title=)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlDoi = params.get("doi");
    const urlTitle = params.get("title");
    if (urlDoi) {
      setDoi(urlDoi);
      fetchGraphFromParams(urlDoi, undefined);
    } else if (urlTitle) {
      setTitle(urlTitle);
      fetchGraphFromParams(undefined, urlTitle);
    }
  }, []);

  const fetchGraph = async (e: React.FormEvent) => {
    e.preventDefault();
    fetchGraphFromParams();
  };

  const drawGraph = useCallback(() => {
    if (!graph || !svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const allNodes: GraphNode[] = [
      { ...graph.seed, relationship: "seed" as const },
      ...graph.nodes,
    ];

    const years = allNodes.map((n) => n.year).filter((y): y is number => y !== null);
    const minYear = Math.min(...years, 2000);
    const maxYear = Math.max(...years, 2024);
    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([minYear, maxYear]);

    const maxCitations = Math.max(...allNodes.map((n) => n.citedByCount), 1);
    const sizeScale = d3.scaleLog().domain([1, maxCitations + 1]).range([8, 28]).clamp(true);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g");

    // Zoom behaviour
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        setTransform(event.transform);
      });
    svg.call(zoom as d3.ZoomBehavior<SVGSVGElement, unknown>);

    // Links
    const linkGroup = g.append("g").attr("class", "links");
    const linkSel = linkGroup
      .selectAll("line")
      .data(graph.edges)
      .join("line")
      .attr("stroke", (d) => d.type === "co-citation" ? "#cbd5e1" : "#94a3b8")
      .attr("stroke-opacity", (d) => d.type === "co-citation" ? 0.2 : 0.5)
      .attr("stroke-width", (d) => d.type === "cites" ? 2 : 1);

    // Nodes
    const nodeGroup = g.append("g").attr("class", "nodes");
    const nodeSel = nodeGroup
      .selectAll<SVGGElement, GraphNode>("g")
      .data(allNodes, (d) => d.id)
      .join("g")
      .attr("cursor", "pointer")
      .on("click", (_event, d) => setSelected(d));

    nodeSel.append("circle")
      .attr("r", (d) => d.relationship === "seed" ? 22 : sizeScale(d.citedByCount + 1))
      .attr("fill", (d) => d.relationship === "seed" ? "#f59e0b" : colorScale(d.year ?? minYear))
      .attr("stroke", (d) => d.relationship === "seed" ? "#d97706" : "#fff")
      .attr("stroke-width", (d) => d.relationship === "seed" ? 3 : 1.5)
      .attr("opacity", 0.9);

    nodeSel.append("text")
      .text((d) => {
        const words = d.title.split(" ");
        return words.slice(0, 2).join(" ") + (words.length > 2 ? "…" : "");
      })
      .attr("text-anchor", "middle")
      .attr("dy", (d) => (d.relationship === "seed" ? 22 : sizeScale(d.citedByCount + 1)) + 12)
      .attr("font-size", "10")
      .attr("fill", "#334155")
      .attr("pointer-events", "none");

    // Force simulation
    if (simRef.current) simRef.current.stop();

    const sim = d3.forceSimulation<GraphNode>(allNodes)
      .force("link", d3.forceLink<GraphNode, GraphEdge>(graph.edges)
        .id((d) => d.id)
        .distance((d) => d.type === "co-citation" ? 120 : 100)
        .strength((d) => d.type === "co-citation" ? 0.1 : 0.7)
      )
      .force("charge", d3.forceManyBody().strength(-250))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<GraphNode>((d) =>
        d.relationship === "seed" ? 35 : sizeScale(d.citedByCount + 1) + 8
      ))
      .on("tick", () => {
        linkSel
          .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
          .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
          .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
          .attr("y2", (d) => (d.target as GraphNode).y ?? 0);
        nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

    // Drag
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeSel.call(drag);
    simRef.current = sim;
  }, [graph]);

  useEffect(() => {
    drawGraph();
    return () => { simRef.current?.stop(); };
  }, [drawGraph]);

  const handleAddToCollection = (node: GraphNode) => {
    if (!node.abstract) {
      toast({ title: "No abstract available to save" });
      return;
    }
    addRawSnippet(`${node.title}\n\n${node.abstract}`, node.doi ?? node.url);
    toast({ title: "Added to collection" });
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <aside className="w-72 shrink-0 border-r border-border bg-sidebar flex flex-col overflow-y-auto p-4 space-y-4">
        <div>
          <h1 className="font-serif text-lg font-medium text-foreground">Connected Papers</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Explore the citation network around any paper. Enter a DOI or title to start.
          </p>
        </div>

        <form onSubmit={fetchGraph} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">DOI</Label>
            <Input
              placeholder="10.1038/s41586-023-..."
              className="text-sm bg-background font-mono text-xs"
              value={doi}
              onChange={(e) => setDoi(e.target.value)}
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-center">or</p>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Paper title</Label>
            <Input
              placeholder="e.g. Attention is all you need"
              className="text-sm bg-background"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            disabled={(!doi.trim() && !title.trim()) || loading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {loading ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Building graph…</> : <><Search className="h-3.5 w-3.5 mr-2" />Build graph</>}
          </Button>
        </form>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-xs p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Legend */}
        {graph && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Legend</p>
            <div className="space-y-1.5">
              {[
                { color: "#f59e0b", label: "Seed paper", size: 12 },
                { color: "#10b981", label: "Referenced", size: 10 },
                { color: "#6366f1", label: "Related", size: 10 },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <svg width="14" height="14">
                    <circle cx="7" cy="7" r={l.size / 2} fill={l.color} />
                  </svg>
                  {l.label}
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground">Node size = citation count<br />Color = year (old=red, recent=green)</p>
            </div>
          </div>
        )}

        {/* Selected paper */}
        {selected && (
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Selected paper</p>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground leading-snug">{selected.title}</p>
              <p className="text-xs text-muted-foreground">
                {selected.authors.slice(0, 2).join(", ")}{selected.authors.length > 2 ? " et al." : ""}
                {selected.year ? ` · ${selected.year}` : ""}
              </p>
              {selected.venue && <p className="text-xs text-muted-foreground italic">{selected.venue}</p>}
              <div className="flex gap-1 flex-wrap">
                {selected.citedByCount > 0 && (
                  <Badge variant="outline" className="text-[10px]">{selected.citedByCount} citations</Badge>
                )}
                <Badge variant="outline" className={cn("text-[10px]", selected.relationship === "seed" ? "bg-amber-50 text-amber-700 border-amber-200" : selected.relationship === "reference" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-violet-50 text-violet-700 border-violet-200")}>
                  {selected.relationship}
                </Badge>
              </div>
              {selected.abstract && (
                <p className="text-xs text-foreground/70 line-clamp-3">{selected.abstract}</p>
              )}
              <div className="flex gap-1.5">
                {selected.url && (
                  <a href={selected.url} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
                      <ExternalLink className="h-3 w-3" />Open
                    </Button>
                  </a>
                )}
                <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => handleAddToCollection(selected)}>
                  <BookmarkPlus className="h-3 w-3" />Save
                </Button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Graph canvas */}
      <main className="flex-1 relative bg-slate-50 dark:bg-slate-950 overflow-hidden">
        {!graph && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-3">
              <Star className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground text-sm">Enter a DOI or title to build the citation graph</p>
            </div>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
              <p className="text-muted-foreground text-sm">Fetching citation network…</p>
            </div>
          </div>
        )}
        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{ display: graph ? "block" : "none" }}
        />
        {/* Zoom controls */}
        {graph && (
          <div className="absolute top-4 right-4 flex flex-col gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-card/90 backdrop-blur-sm"
              onClick={() => {
                const svg = d3.select(svgRef.current!);
                svg.transition().call(d3.zoom<SVGSVGElement, unknown>().scaleBy as any, 1.3);
              }}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-card/90 backdrop-blur-sm"
              onClick={() => {
                const svg = d3.select(svgRef.current!);
                svg.transition().call(d3.zoom<SVGSVGElement, unknown>().scaleBy as any, 0.7);
              }}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {graph && (
          <div className="absolute bottom-4 left-4 text-[10px] text-muted-foreground bg-card/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-border">
            {graph.nodes.length + 1} papers · {graph.edges.length} connections · Click a node to inspect
          </div>
        )}
      </main>
    </div>
  );
}
