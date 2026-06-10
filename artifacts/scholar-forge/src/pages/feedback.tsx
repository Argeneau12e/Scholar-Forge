import { useState, useCallback } from "react";
import {
  MessageSquare, Plus, Trash2, Download, Upload, Copy, Check,
  ChevronDown, ChevronRight, User, Calendar, AlertCircle, CheckCircle2, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Comment {
  id: string;
  text: string;
  selection: string;
  author: string;
  role: "student" | "supervisor" | "peer";
  priority: "critical" | "major" | "minor" | "suggestion";
  status: "open" | "resolved" | "wont-fix";
  createdAt: string;
  replies: { id: string; text: string; author: string; createdAt: string }[];
}

interface ReviewSession {
  id: string;
  documentTitle: string;
  documentContent: string;
  reviewerName: string;
  createdAt: string;
  comments: Comment[];
}

const STORAGE_KEY = "sf2_feedback_sessions";

const PRIORITY_META: Record<string, { label: string; badge: string; icon: React.ReactNode }> = {
  critical:   { label: "Critical",   badge: "bg-red-100 text-red-700 border-red-200",   icon: <AlertCircle className="h-3.5 w-3.5 text-red-600" /> },
  major:      { label: "Major",      badge: "bg-amber-100 text-amber-700 border-amber-200",  icon: <AlertCircle className="h-3.5 w-3.5 text-amber-500" /> },
  minor:      { label: "Minor",      badge: "bg-blue-100 text-blue-700 border-blue-200",   icon: <AlertCircle className="h-3.5 w-3.5 text-blue-500" /> },
  suggestion: { label: "Suggestion", badge: "bg-violet-100 text-violet-700 border-violet-200", icon: <MessageSquare className="h-3.5 w-3.5 text-violet-500" /> },
};

const STATUS_META: Record<string, { label: string; icon: React.ReactNode }> = {
  open:      { label: "Open",      icon: <Clock        className="h-3 w-3 text-amber-500" /> },
  resolved:  { label: "Resolved",  icon: <CheckCircle2 className="h-3 w-3 text-emerald-500" /> },
  "wont-fix": { label: "Won't fix", icon: <CheckCircle2 className="h-3 w-3 text-muted-foreground" /> },
};

function loadSessions(): ReviewSession[] { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; } }
function saveSessions(s: ReviewSession[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

// ─── Comment card ─────────────────────────────────────────────────────────────
function CommentCard({ comment, onUpdate, onDelete }: {
  comment: Comment;
  onUpdate: (c: Comment) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);
  const meta = PRIORITY_META[comment.priority];

  const addReply = () => {
    if (!replyText.trim()) return;
    onUpdate({
      ...comment,
      replies: [...comment.replies, { id: crypto.randomUUID(), text: replyText.trim(), author: "You", createdAt: new Date().toISOString() }],
    });
    setReplyText("");
    setShowReply(false);
  };

  return (
    <div className={cn("rounded-xl border bg-card p-4 space-y-3 transition-opacity", comment.status === "resolved" ? "opacity-60" : "")}>
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[11px] font-semibold text-foreground">{comment.author}</span>
            <Badge variant="outline" className="text-[10px] capitalize">{comment.role}</Badge>
            <Badge variant="outline" className={cn("text-[10px]", meta.badge)}>{meta.label}</Badge>
            <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
              {STATUS_META[comment.status].icon}
              {STATUS_META[comment.status].label}
            </div>
          </div>
          {comment.selection && (
            <blockquote className="text-[11px] text-muted-foreground italic border-l-2 border-primary/30 pl-2 mb-1 line-clamp-2">
              "{comment.selection}"
            </blockquote>
          )}
          <p className="text-sm text-foreground leading-relaxed">{comment.text}</p>
          <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <Calendar className="h-2.5 w-2.5" />
            {new Date(comment.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div className="ml-11 space-y-2 border-l border-border pl-3">
          {comment.replies.map((r) => (
            <div key={r.id}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-semibold text-foreground">{r.author}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              </div>
              <p className="text-xs text-foreground/80">{r.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap ml-11">
        <select value={comment.status} onChange={(e) => onUpdate({ ...comment, status: e.target.value as Comment["status"] })}
          className="text-[10px] rounded border border-input bg-background px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/40">
          <option value="open">Open</option>
          <option value="resolved">Mark resolved</option>
          <option value="wont-fix">Won't fix</option>
        </select>
        <button onClick={() => setShowReply((v) => !v)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">Reply</button>
        <button onClick={onDelete} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors ml-auto">Delete</button>
      </div>

      {showReply && (
        <div className="ml-11 flex gap-2">
          <input value={replyText} onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addReply()}
            placeholder="Write a reply…" autoFocus
            className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
          <Button size="sm" onClick={addReply} className="text-xs h-7">Send</Button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function FeedbackPage() {
  const [sessions, setSessions] = useState<ReviewSession[]>(loadSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessions[0]?.id ?? null);
  const [newComment, setNewComment] = useState<{ text: string; selection: string; author: string; role: Comment["role"]; priority: Comment["priority"] }>({ text: "", selection: "", author: "", role: "supervisor", priority: "minor" });
  const [showNewComment, setShowNewComment] = useState(false);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [newSessionForm, setNewSessionForm] = useState({ title: "", reviewer: "" });
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  const update = useCallback((next: ReviewSession[]) => { setSessions(next); saveSessions(next); }, []);

  const createSession = () => {
    if (!newSessionForm.title.trim()) { toast({ title: "Enter a document title" }); return; }
    const session: ReviewSession = {
      id: crypto.randomUUID(),
      documentTitle: newSessionForm.title.trim(),
      documentContent: "",
      reviewerName: newSessionForm.reviewer.trim() || "Reviewer",
      createdAt: new Date().toISOString(),
      comments: [],
    };
    const next = [session, ...sessions];
    update(next);
    setActiveSessionId(session.id);
    setNewSessionForm({ title: "", reviewer: "" });
    toast({ title: "Review session created" });
  };

  const addComment = () => {
    if (!newComment.text.trim() || !activeSession) return;
    const comment: Comment = {
      id: crypto.randomUUID(),
      text: newComment.text.trim(),
      selection: newComment.selection.trim(),
      author: newComment.author.trim() || "Reviewer",
      role: newComment.role,
      priority: newComment.priority,
      status: "open",
      createdAt: new Date().toISOString(),
      replies: [],
    };
    const next = sessions.map((s) =>
      s.id === activeSessionId ? { ...s, comments: [...s.comments, comment] } : s
    );
    update(next);
    setNewComment({ text: "", selection: "", author: "", role: "supervisor", priority: "minor" });
    setShowNewComment(false);
  };

  const updateComment = (comment: Comment) => {
    const next = sessions.map((s) =>
      s.id === activeSessionId
        ? { ...s, comments: s.comments.map((c) => c.id === comment.id ? comment : c) }
        : s
    );
    update(next);
  };

  const deleteComment = (id: string) => {
    const next = sessions.map((s) =>
      s.id === activeSessionId ? { ...s, comments: s.comments.filter((c) => c.id !== id) } : s
    );
    update(next);
  };

  const deleteSession = (id: string) => {
    const next = sessions.filter((s) => s.id !== id);
    update(next);
    setActiveSessionId(next[0]?.id ?? null);
  };

  const exportSession = () => {
    if (!activeSession) return;
    const open = activeSession.comments.filter((c) => c.status === "open").length;
    const resolved = activeSession.comments.filter((c) => c.status === "resolved").length;
    const lines = [
      `FEEDBACK REPORT: ${activeSession.documentTitle}`,
      `Reviewer: ${activeSession.reviewerName}`,
      `Date: ${new Date(activeSession.createdAt).toLocaleDateString("en-GB")}`,
      `Total comments: ${activeSession.comments.length} (${open} open, ${resolved} resolved)`,
      `${"─".repeat(60)}`,
      ...activeSession.comments.map((c, i) => [
        `\n[${i + 1}] ${c.priority.toUpperCase()} — ${c.role}`,
        c.selection ? `  Quoted text: "${c.selection}"` : "",
        `  Comment: ${c.text}`,
        `  Status: ${c.status}`,
        ...c.replies.map((r) => `  ↳ ${r.author}: ${r.text}`),
      ].filter(Boolean).join("\n")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `feedback-${activeSession.documentTitle}.txt`; a.click();
  };

  const copyShareCode = () => {
    if (!activeSession) return;
    const code = btoa(JSON.stringify({ id: activeSession.id, title: activeSession.documentTitle, comments: activeSession.comments.length }));
    navigator.clipboard.writeText(`ScholarForge feedback session: ${activeSession.documentTitle}\nCode: ${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Share code copied to clipboard" });
  };

  const importFeedback = () => {
    try {
      const parsed = JSON.parse(importText);
      if (!parsed.comments || !Array.isArray(parsed.comments)) throw new Error("Invalid format");
      const session: ReviewSession = {
        id: crypto.randomUUID(),
        documentTitle: parsed.documentTitle ?? "Imported document",
        documentContent: parsed.documentContent ?? "",
        reviewerName: parsed.reviewerName ?? "Reviewer",
        createdAt: new Date().toISOString(),
        comments: parsed.comments,
      };
      const next = [session, ...sessions];
      update(next);
      setActiveSessionId(session.id);
      setShowImport(false);
      setImportText("");
      toast({ title: "Feedback imported successfully" });
    } catch {
      toast({ title: "Invalid feedback file", description: "Paste the exported JSON feedback file", variant: "destructive" });
    }
  };

  const openCount = activeSession?.comments.filter((c) => c.status === "open").length ?? 0;
  const resolvedCount = activeSession?.comments.filter((c) => c.status === "resolved").length ?? 0;
  const criticalCount = activeSession?.comments.filter((c) => c.priority === "critical" && c.status === "open").length ?? 0;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar — sessions */}
      <aside className="w-60 border-r border-border bg-sidebar flex flex-col shrink-0 overflow-y-auto">
        <div className="p-3 border-b border-border">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Review sessions</p>
          <div className="space-y-2">
            <input value={newSessionForm.title} onChange={(e) => setNewSessionForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Document title"
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
            <input value={newSessionForm.reviewer} onChange={(e) => setNewSessionForm((f) => ({ ...f, reviewer: e.target.value }))}
              placeholder="Reviewer name"
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
            <Button size="sm" className="w-full text-xs gap-1" onClick={createSession}>
              <Plus className="h-3 w-3" /> New session
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-4">No sessions yet — create one above</p>
          )}
          {sessions.map((s) => {
            const open = s.comments.filter((c) => c.status === "open").length;
            return (
              <button key={s.id} onClick={() => setActiveSessionId(s.id)}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-lg transition-colors",
                  s.id === activeSessionId ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}>
                <p className="text-xs font-medium truncate">{s.documentTitle}</p>
                <p className="text-[10px] mt-0.5">{open} open · {s.comments.length} total</p>
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-border">
          <Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={() => setShowImport((v) => !v)}>
            <Upload className="h-3 w-3" /> Import feedback
          </Button>
        </div>
      </aside>

      {/* Main panel */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!activeSession ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Create a review session to track feedback on your writing.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 gap-4 flex-wrap">
              <div>
                <h2 className="text-base font-serif font-semibold text-foreground">{activeSession.documentTitle}</h2>
                <p className="text-xs text-muted-foreground">Reviewer: {activeSession.reviewerName} · {new Date(activeSession.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {criticalCount > 0 && <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">{criticalCount} critical</Badge>}
                  <span>{openCount} open</span>
                  <span>{resolvedCount} resolved</span>
                </div>
                <Button variant="outline" size="sm" className="text-xs gap-1" onClick={exportSession}>
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-1" onClick={copyShareCode}>
                  {copied ? <><Check className="h-3.5 w-3.5 text-emerald-600" />Copied</> : <><Copy className="h-3.5 w-3.5" />Share</>}
                </Button>
                <button onClick={() => deleteSession(activeSession.id)} className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {activeSession.comments.length > 0 && (
              <div className="px-6 py-3 border-b border-border shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${Math.round((resolvedCount / activeSession.comments.length) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {Math.round((resolvedCount / activeSession.comments.length) * 100)}% resolved
                  </span>
                </div>
              </div>
            )}

            {/* Import zone */}
            {showImport && (
              <div className="border-b border-border bg-muted/30 p-4 space-y-2 shrink-0">
                <p className="text-xs font-medium text-foreground">Paste exported feedback JSON</p>
                <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none font-mono" />
                <div className="flex gap-2">
                  <Button size="sm" className="text-xs" onClick={importFeedback}>Import</Button>
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowImport(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {activeSession.comments.length === 0 && !showNewComment && (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No comments yet — add the first piece of feedback below.</p>
                </div>
              )}

              {activeSession.comments.map((c) => (
                <CommentCard key={c.id} comment={c}
                  onUpdate={updateComment} onDelete={() => deleteComment(c.id)} />
              ))}

              {/* New comment form */}
              {showNewComment && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <p className="text-xs font-semibold text-foreground">Add feedback</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Reviewer name</label>
                      <input value={newComment.author} onChange={(e) => setNewComment((f) => ({ ...f, author: e.target.value }))}
                        placeholder="e.g. Dr. Smith"
                        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Role</label>
                      <select value={newComment.role} onChange={(e) => setNewComment((f) => ({ ...f, role: e.target.value as Comment["role"] }))}
                        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40">
                        <option value="supervisor">Supervisor</option>
                        <option value="peer">Peer reviewer</option>
                        <option value="student">Self</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Quoted text (optional)</label>
                    <input value={newComment.selection} onChange={(e) => setNewComment((f) => ({ ...f, selection: e.target.value }))}
                      placeholder="Paste the text being commented on…"
                      className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Comment *</label>
                    <textarea value={newComment.text} onChange={(e) => setNewComment((f) => ({ ...f, text: e.target.value }))}
                      rows={3} placeholder="What needs to change and why?"
                      className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Priority</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {(["critical","major","minor","suggestion"] as const).map((p) => (
                        <button key={p} onClick={() => setNewComment((f) => ({ ...f, priority: p }))}
                          className={cn("px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors capitalize",
                            newComment.priority === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="text-xs" onClick={addComment}>Add comment</Button>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowNewComment(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-border shrink-0">
              <Button onClick={() => setShowNewComment(true)} className="gap-1.5 text-sm">
                <Plus className="h-4 w-4" /> Add feedback
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
