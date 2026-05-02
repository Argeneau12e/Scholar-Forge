import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { Network, Download, AlertTriangle, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCollection, type CollectionItem } from "@/hooks/useCollection";

// ─── Types ────────────────────────────────────────────────────────────────────

type RelType = "supports" | "contradicts" | "extends" | "replicates" | "challenges";

interface ArgNode {
  id: string;
  label: string;
  cluster: string;
  centrality: number;
}

interface ArgEdge {
  source: string;
  target: string;
  relationship: RelType;
  strength: number;
  note: string;
}

interface ArgMapResult {
  nodes: ArgNode[];
  edges: ArgEdge[];
  thesisNode: { label: string; bestPosition: string; positioning: string };
}

// D3 simulation node — extends NodeDatum so x/y/vx/vy/fx/fy are all defined
interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  cluster: string;
  centrality: number;
  isThesis?: boolean;
}

// D3 simulation edge — source/target will be resolved to SimNode objects by d3
interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  relationship: RelType;
  strength: number;
  note: string;
  srcId: string;
  tgtId: string;
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  snippet: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_ITEMS = 5;

const EDGE_COLORS: Record<RelType, string> = {
  supports:    "#4ade80",
  contradicts: "#f87171",
  extends:     "#60a5fa",
  replicates:  "#a78bfa",
  challenges:  "#fb923c",
};

const EDGE_LABELS: Record<RelType, string> = {
  supports:    "Supports",
  contradicts: "Contradicts",
  extends:     "Extends",
  replicates:  "Replicates",
  challenges:  "Challenges",
};

const CLUSTER_PALETTE = [
  "#059669", "#7c3aed", "#dc2626", "#d97706", "#0284c7", "#be185d",
];

const THESIS_KEY = "sf_thesis";
function getSavedThesis(): string {
  try { return localStorage.getItem(THESIS_KEY) ?? ""; } catch { return ""; }
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function nodeRadius(node: SimNode): number {
  if (node.isThesis) return 26;
  return 16 + node.centrality * 16;
}

function starPath(r: number): string {
  const pts = 5;
  const inner = r * 0.42;
  let d = "";
  for (let i = 0; i < pts * 2; i++) {
    const radius = i % 2 === 0 ? r : inner;
    const angle = (i * Math.PI) / pts - Math.PI / 2;
    d += (i === 0 ? "M" : "L") + `${radius * Math.cos(angle)},${radius * Math.sin(angle)}`;
  }
  return d + "Z";
}

// ─── Graph renderer ───────────────────────────────────────────────────────────

function renderGraph(
  svgEl: SVGSVGElement,
  data: ArgMapResult,
  itemMap: Map<string, CollectionItem>,
  onSelectNode: (id: string | null, edges: ArgEdge[]) => void,
  onHoverEdge: (note: string | null) => void,
  onTooltip: (t: TooltipState | null) => void
): () => void {
  const W = svgEl.clientWidth || 800;
  const H = svgEl.clientHeight || 520;

  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();

  // Cluster colour map
  const clusters = Array.from(new Set(data.nodes.map((n) => n.cluster)));
  const clusterColor = (c: string): string =>
    CLUSTER_PALETTE[clusters.indexOf(c) % CLUSTER_PALETTE.length] ?? "#888";

  // Build nodes
  const thesisNode: SimNode = {
    id: "thesis",
    label: data.thesisNode.label,
    cluster: "__thesis__",
    centrality: 1,
    isThesis: true,
    fx: W / 2,
    fy: H / 2,
  };
  const paperNodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
  const allNodes: SimNode[] = [...paperNodes, thesisNode];

  // Build edges
  const paperEdges: SimEdge[] = data.edges.map((e) => ({
    source: e.source,
    target: e.target,
    relationship: e.relationship,
    strength: e.strength,
    note: e.note,
    srcId: e.source,
    tgtId: e.target,
  }));

  const thesisEdges: SimEdge[] = data.thesisNode.bestPosition
    ? [
        {
          source: "thesis",
          target: data.thesisNode.bestPosition,
          relationship: "supports" as RelType,
          strength: 0.9,
          note: data.thesisNode.positioning,
          srcId: "thesis",
          tgtId: data.thesisNode.bestPosition,
        },
      ]
    : [];

  const allEdges: SimEdge[] = [...paperEdges, ...thesisEdges];

  // Arrow markers per relation type
  const defs = svg.append("defs");
  (Object.keys(EDGE_COLORS) as RelType[]).forEach((rel) => {
    defs
      .append("marker")
      .attr("id", `arrow-${rel}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 24)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", EDGE_COLORS[rel])
      .attr("opacity", 0.85);
  });

  // Zoom container
  const container = svg.append("g");
  svg.call(
    d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) =>
        container.attr("transform", (event.transform as d3.ZoomTransform).toString())
      )
  );

  // Simulation
  const sim = d3
    .forceSimulation<SimNode>(allNodes)
    .force(
      "link",
      d3
        .forceLink<SimNode, SimEdge>(allEdges)
        .id((d) => d.id)
        .distance((e) => 120 + (1 - e.strength) * 80)
        .strength((e) => e.strength * 0.4)
    )
    .force("charge", d3.forceManyBody<SimNode>().strength(-340))
    .force("center", d3.forceCenter(W / 2, H / 2))
    .force(
      "collision",
      d3.forceCollide<SimNode>().radius((d) => nodeRadius(d) + 14)
    );

  // ── Edges ────────────────────────────────────────────────────────────────────
  const linkSel = container
    .append("g")
    .selectAll<SVGLineElement, SimEdge>("line")
    .data(allEdges)
    .join("line")
    .attr("stroke", (d) => EDGE_COLORS[d.relationship])
    .attr("stroke-width", (d) => 1.5 + d.strength * 3)
    .attr("stroke-opacity", 0.7)
    .attr("marker-end", (d) => `url(#arrow-${d.relationship})`)
    .style("cursor", "pointer")
    .on("mouseover", (_: MouseEvent, d: SimEdge) => onHoverEdge(d.note))
    .on("mouseout", () => onHoverEdge(null));

  // ── Nodes ────────────────────────────────────────────────────────────────────
  const nodeSel = container
    .append("g")
    .selectAll<SVGGElement, SimNode>("g")
    .data(allNodes)
    .join("g")
    .style("cursor", "pointer")
    .call(
      d3
        .drag<SVGGElement, SimNode>()
        .on("start", (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) => {
          if (!event.active) sim.alphaTarget(0.3).restart();
          if (!d.isThesis) { d.fx = d.x; d.fy = d.y; }
        })
        .on("drag", (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) => {
          if (!d.isThesis) { d.fx = event.x; d.fy = event.y; }
        })
        .on("end", (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) => {
          if (!event.active) sim.alphaTarget(0);
          if (!d.isThesis) { d.fx = null; d.fy = null; }
        })
    );

  // Shapes
  nodeSel.each(function (d: SimNode) {
    const g = d3.select(this);
    if (d.isThesis) {
      g.append("path")
        .attr("d", starPath(nodeRadius(d)))
        .attr("fill", "#f59e0b")
        .attr("stroke", "#92400e")
        .attr("stroke-width", 2)
        .style("filter", "drop-shadow(0 2px 4px rgba(245,158,11,0.4))");
    } else {
      g.append("circle")
        .attr("r", nodeRadius(d))
        .attr("fill", clusterColor(d.cluster))
        .attr("fill-opacity", 0.88)
        .attr("stroke", "#fff")
        .attr("stroke-width", 2)
        .style("filter", "drop-shadow(0 1px 3px rgba(0,0,0,0.18))");
    }
  });

  // Labels
  nodeSel
    .append("text")
    .text((d: SimNode) => (d.isThesis ? "★ Thesis" : d.label.slice(0, 22)))
    .attr("text-anchor", "middle")
    .attr("dy", (d: SimNode) => nodeRadius(d) + 13)
    .attr("font-size", "10")
    .attr("fill", "#444")
    .attr("pointer-events", "none")
    .style("user-select", "none");

  // Hover tooltip
  nodeSel
    .on("mouseover", (event: MouseEvent, d: SimNode) => {
      const item = itemMap.get(d.id);
      const rect = svgEl.getBoundingClientRect();
      onTooltip({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        title: item ? item.title : d.isThesis ? "Your thesis statement" : d.label,
        snippet: item
          ? (item.originalSnippet ?? item.abstract ?? item.paraphrase ?? "").slice(0, 150)
          : d.isThesis
          ? data.thesisNode.positioning
          : "",
      });
    })
    .on("mousemove", (event: MouseEvent) => {
      const rect = svgEl.getBoundingClientRect();
      onTooltip((prev) =>
        prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null
      );
    })
    .on("mouseout", () => onTooltip(null));

  // Click — highlight + side panel
  nodeSel.on("click", (_: MouseEvent, d: SimNode) => {
    const nodeEdges = data.edges.filter((e) => e.source === d.id || e.target === d.id);
    if (d.isThesis) {
      thesisEdges.forEach((te) =>
        nodeEdges.push({ ...te, source: te.srcId, target: te.tgtId })
      );
    }

    linkSel.attr("stroke-opacity", (e: SimEdge) =>
      e.srcId === d.id || e.tgtId === d.id ? 1 : 0.1
    );
    nodeSel
      .select("circle, path")
      .attr("fill-opacity", (n: SimNode) => {
        if (n.id === d.id) return 1;
        const connected = allEdges.some(
          (e) => (e.srcId === d.id && e.tgtId === n.id) || (e.tgtId === d.id && e.srcId === n.id)
        );
        return connected ? 0.88 : 0.18;
      });

    onSelectNode(d.id, nodeEdges);
  });

  // Click background → deselect
  svg.on("click", (event: MouseEvent) => {
    if (event.target === svgEl) {
      linkSel.attr("stroke-opacity", 0.7);
      nodeSel.select("circle, path").attr("fill-opacity", 0.88);
      onSelectNode(null, []);
    }
  });

  // Tick
  sim.on("tick", () => {
    linkSel
      .attr("x1", (d: SimEdge) => (d.source as SimNode).x ?? 0)
      .attr("y1", (d: SimEdge) => (d.source as SimNode).y ?? 0)
      .attr("x2", (d: SimEdge) => (d.target as SimNode).x ?? 0)
      .attr("y2", (d: SimEdge) => (d.target as SimNode).y ?? 0);
    nodeSel.attr("transform", (d: SimNode) => `translate(${d.x ?? 0},${d.y ?? 0})`);
  });

  return () => sim.stop();
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ArgumentMapper() {
  const { items } = useCollection();

  const [data, setData] = useState<ArgMapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thesis] = useState(() => getSavedThesis());

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdges, setSelectedEdges] = useState<ArgEdge[]>([]);
  const [hoveredEdgeNote, setHoveredEdgeNote] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const count = items.length;
  const isUnlocked = count >= MIN_ITEMS;
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const handleSelectNode = useCallback((id: string | null, edges: ArgEdge[]) => {
    setSelectedNodeId(id);
    setSelectedEdges(edges);
  }, []);

  // Re-render graph when data changes
  useEffect(() => {
    if (!data || !svgRef.current) return;
    cleanupRef.current?.();
    const stop = renderGraph(
      svgRef.current,
      data,
      itemMap,
      handleSelectNode,
      setHoveredEdgeNote,
      setTooltip
    );
    cleanupRef.current = stop;
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    setSelectedNodeId(null);
    setSelectedEdges([]);
    try {
      const resp = await fetch("/api/argmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            id: item.id,
            title: item.title,
            authors: item.authors,
            year: item.year,
            abstract: item.abstract,
            originalSnippet: item.originalSnippet,
            paraphrase: item.paraphrase,
          })),
          thesis,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setError((json as { error: string }).error ?? "Analysis failed.");
        return;
      }
      setData(json as ArgMapResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPng = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const W = svgEl.clientWidth;
    const H = svgEl.clientHeight;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W * 2;
      canvas.height = H * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(2, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.download = `ScholarForge-ArgMap-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = url;
  };

  const contradictions = data?.edges.filter((e) => e.relationship === "contradicts") ?? [];
  const selectedItem = selectedNodeId ? itemMap.get(selectedNodeId) : undefined;
  const selectedArgNode = data?.nodes.find((n) => n.id === selectedNodeId);
  const thesisSelected = selectedNodeId === "thesis";

  // ── Locked ────────────────────────────────────────────────────────────────────
  if (!isUnlocked) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/30 p-8 space-y-5 text-center max-w-2xl mx-auto">
        <div className="h-14 w-14 rounded-full bg-violet-50 flex items-center justify-center mx-auto">
          <Network className="h-7 w-7 text-violet-600/50" />
        </div>
        <div>
          <h3 className="font-serif text-xl">Argument Mapper</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Collect {MIN_ITEMS} papers to visualise how they relate to each other and your thesis.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{count} / {MIN_ITEMS} papers</span>
            <span>{MIN_ITEMS - count} more needed</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-400/60 rounded-full transition-all duration-500"
              style={{ width: `${(count / MIN_ITEMS) * 100}%` }}
            />
          </div>
        </div>
        <Button disabled className="bg-muted text-muted-foreground cursor-not-allowed gap-2 w-full max-w-xs">
          <Network className="h-4 w-4" /> Map Arguments
        </Button>
      </div>
    );
  }

  // ── Unlocked ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif text-xl flex items-center gap-2">
            <Network className="h-5 w-5 text-violet-600" />
            Argument Mapper
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {count} papers · interactive force-directed graph
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={handleDownloadPng}>
              <Download className="h-3.5 w-3.5" /> PNG
            </Button>
          )}
          <Button
            onClick={handleAnalyze}
            disabled={loading}
            className="bg-violet-700 hover:bg-violet-800 text-white gap-2 h-8 text-sm"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Mapping…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {data ? "Re-map" : "Map Arguments"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-2xl border bg-gradient-to-br from-violet-50/60 to-white p-12 flex flex-col items-center gap-4">
          <svg className="animate-spin h-10 w-10 text-violet-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-sm text-violet-700 font-medium animate-pulse">
            Analysing intellectual relationships…
          </p>
        </div>
      )}

      {/* Graph + side panel */}
      {data && !loading && (
        <div className="flex gap-4">
          {/* SVG canvas */}
          <div
            className="relative flex-1 rounded-2xl border bg-white overflow-hidden"
            style={{ minHeight: 520 }}
          >
            <svg ref={svgRef} className="w-full" style={{ minHeight: 520 }} />

            {/* Hover tooltip */}
            {tooltip && (
              <div
                className="pointer-events-none absolute z-20 max-w-[220px] rounded-xl border bg-white shadow-xl px-3 py-2.5 text-xs"
                style={{
                  left: Math.min(tooltip.x + 14, (svgRef.current?.clientWidth ?? 800) - 240),
                  top: Math.max(tooltip.y - 60, 10),
                }}
              >
                <p className="font-semibold leading-snug mb-1 line-clamp-2">{tooltip.title}</p>
                {tooltip.snippet && (
                  <p className="text-muted-foreground leading-snug line-clamp-3">{tooltip.snippet}…</p>
                )}
              </div>
            )}

            {/* Edge hover note */}
            {hoveredEdgeNote && !tooltip && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-20 rounded-xl border bg-white/95 shadow-lg px-4 py-2 text-xs text-foreground max-w-xs text-center">
                {hoveredEdgeNote}
              </div>
            )}
          </div>

          {/* Side panel */}
          <div className="w-64 shrink-0 space-y-3">
            {!selectedNodeId && (
              <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-center space-y-2">
                <Network className="h-6 w-6 text-muted-foreground/30 mx-auto" />
                <p className="text-xs text-muted-foreground">Click a node to see its relationships</p>
              </div>
            )}

            {selectedNodeId && (
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <div>
                  {!thesisSelected && selectedArgNode && (
                    <Badge variant="outline" className="text-[10px] mb-1">{selectedArgNode.cluster}</Badge>
                  )}
                  <p className="font-semibold text-sm leading-snug">
                    {thesisSelected
                      ? "★ Your Thesis"
                      : selectedItem?.title ?? selectedArgNode?.label ?? selectedNodeId}
                  </p>
                  {!thesisSelected && selectedItem && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {selectedItem.authors.slice(0, 2).join(", ")}
                      {selectedItem.year ? `, ${selectedItem.year}` : ""}
                    </p>
                  )}
                </div>

                {thesisSelected && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {data.thesisNode.positioning}
                  </p>
                )}

                {selectedEdges.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Relationships ({selectedEdges.length})
                    </p>
                    {selectedEdges.map((e, i) => {
                      const otherId = e.source === selectedNodeId ? e.target : e.source;
                      const otherNode = data.nodes.find((n) => n.id === otherId);
                      const isOutgoing = e.source === selectedNodeId;
                      return (
                        <div key={i} className="rounded-lg bg-muted/40 px-2.5 py-2 space-y-1">
                          <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: EDGE_COLORS[e.relationship] }}
                            />
                            <span className="font-semibold" style={{ color: EDGE_COLORS[e.relationship] }}>
                              {isOutgoing ? "→" : "←"} {EDGE_LABELS[e.relationship]}
                            </span>
                            <span className="text-muted-foreground truncate">
                              {otherNode?.label ?? String(otherId)}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-snug">{e.note}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Cluster legend */}
            {data.nodes.length > 0 && (
              <div className="rounded-xl border bg-card p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Clusters</p>
                {Array.from(new Set(data.nodes.map((n) => n.cluster))).map((c, i) => (
                  <div key={c} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: CLUSTER_PALETTE[i % CLUSTER_PALETTE.length] }}
                    />
                    <span className="text-foreground/80 truncate">{c}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edge legend */}
      {data && !loading && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Edge types</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {(Object.entries(EDGE_LABELS) as [RelType, string][]).map(([rel, label]) => (
              <div key={rel} className="flex items-center gap-2 text-xs">
                <span className="h-0.5 w-6 rounded-full inline-block" style={{ background: EDGE_COLORS[rel] }} />
                <span className="text-foreground/70">{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-amber-500 text-base leading-none">★</span>
              <span className="text-foreground/70">Your thesis</span>
            </div>
          </div>
        </div>
      )}

      {/* Contradictions */}
      {contradictions.length > 0 && (
        <div className="rounded-xl border bg-red-50/50 p-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-700">
            Detected contradictions ({contradictions.length})
          </p>
          <div className="space-y-2">
            {contradictions.map((e, i) => {
              const nodeA = data!.nodes.find((n) => n.id === e.source);
              const nodeB = data!.nodes.find((n) => n.id === e.target);
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <ChevronRight className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-foreground/80 leading-snug">
                    <span className="font-semibold text-red-700">{nodeA?.label ?? e.source}</span>
                    {" vs "}
                    <span className="font-semibold text-red-700">{nodeB?.label ?? e.target}</span>
                    {" — "}
                    {e.note}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
