import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  useListSupervisors, 
  useCreateSupervisor, 
  useUpdateSupervisor, 
  useDeleteSupervisor,
  useActivateSupervisor,
  getListSupervisorsQueryKey,
  getGetActiveSupervisorQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Plus, Settings, Trash2, CheckCircle2, Circle, AlertCircle, Sparkles } from "lucide-react";
import type { Supervisor } from "@workspace/api-client-react/src/generated/api.schemas";

const supervisorSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  constraints: z.string(), // comma separated
  focusAreas: z.string(), // comma separated
  excludeKeywords: z.string(), // comma separated
  minYear: z.string().optional(),
  maxYear: z.string().optional(),
});

type SupervisorFormValues = z.infer<typeof supervisorSchema>;

export default function Supervisors() {
  const { data: supervisors, isLoading } = useListSupervisors();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateSupervisor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSupervisorsQueryKey() });
        toast({ title: "Supervisor created successfully" });
        setIsFormOpen(false);
        form.reset();
      }
    }
  });

  const updateMutation = useUpdateSupervisor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSupervisorsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetActiveSupervisorQueryKey() });
        toast({ title: "Supervisor updated successfully" });
        setIsFormOpen(false);
        setEditingId(null);
        form.reset();
      }
    }
  });

  const deleteMutation = useDeleteSupervisor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSupervisorsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetActiveSupervisorQueryKey() });
        toast({ title: "Supervisor deleted" });
      }
    }
  });

  const activateMutation = useActivateSupervisor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSupervisorsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetActiveSupervisorQueryKey() });
        toast({ title: "Supervisor activated" });
      }
    }
  });

  const form = useForm<SupervisorFormValues>({
    resolver: zodResolver(supervisorSchema),
    defaultValues: {
      name: "",
      description: "",
      constraints: "",
      focusAreas: "",
      excludeKeywords: "",
      minYear: "",
      maxYear: "",
    }
  });

  const handleEdit = (supervisor: Supervisor) => {
    form.reset({
      name: supervisor.name,
      description: supervisor.description || "",
      constraints: supervisor.constraints?.join(", ") || "",
      focusAreas: supervisor.focusAreas?.join(", ") || "",
      excludeKeywords: supervisor.excludeKeywords?.join(", ") || "",
      minYear: supervisor.minYear?.toString() || "",
      maxYear: supervisor.maxYear?.toString() || "",
    });
    setEditingId(supervisor.id);
    setIsFormOpen(true);
  };

  const handleOpenNew = () => {
    form.reset({
      name: "",
      description: "",
      constraints: "",
      focusAreas: "",
      excludeKeywords: "",
      minYear: "",
      maxYear: "",
    });
    setEditingId(null);
    setIsFormOpen(true);
  };

  const onSubmit = (data: SupervisorFormValues) => {
    // Parse comma separated strings into arrays
    const parseList = (str: string) => str.split(",").map(s => s.trim()).filter(Boolean);
    
    const payload = {
      name: data.name,
      description: data.description || null,
      constraints: parseList(data.constraints),
      focusAreas: parseList(data.focusAreas),
      excludeKeywords: parseList(data.excludeKeywords),
      minYear: data.minYear ? parseInt(data.minYear) : null,
      maxYear: data.maxYear ? parseInt(data.maxYear) : null,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-8 w-full">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">AI Supervisors</h1>
          <p className="text-muted-foreground mt-1">
            Configure AI personas with specific constraints to guide your research discovery.
          </p>
        </div>
        
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenNew}>
              <Plus className="h-4 w-4 mr-2" />
              New Supervisor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">
                {editingId ? "Edit Supervisor" : "Create Supervisor"}
              </DialogTitle>
              <DialogDescription>
                Define constraints and focus areas for this AI research persona.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. strict-methodologist" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Brief description of this persona's goals..." 
                              className="resize-none h-20"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="minYear"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Min Year</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="2018" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="maxYear"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max Year</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="2024" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <FormField
                      control={form.control}
                      name="focusAreas"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Focus Areas (comma-separated)</FormLabel>
                          <FormControl>
                            <Textarea placeholder="machine learning, natural language processing..." {...field} />
                          </FormControl>
                          <FormDescription className="text-xs">Keywords the AI will prioritize.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="excludeKeywords"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Exclude Keywords (comma-separated)</FormLabel>
                          <FormControl>
                            <Textarea placeholder="blockchain, crypto..." {...field} />
                          </FormControl>
                          <FormDescription className="text-xs">Keywords the AI will filter out.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="constraints"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custom Constraints (comma-separated)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="must include empirical evaluation, prefer peer-reviewed..." 
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription className="text-xs">Natural language rules for AI filtering.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <DialogFooter className="pt-4 border-t">
                  <DialogClose asChild>
                    <Button variant="outline" type="button">Cancel</Button>
                  </DialogClose>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingId ? "Save Changes" : "Create Supervisor"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader><div className="h-6 bg-muted rounded w-1/2"></div></CardHeader>
              <CardContent><div className="h-20 bg-muted rounded w-full"></div></CardContent>
            </Card>
          ))}
        </div>
      ) : supervisors?.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-lg bg-card">
          <Settings className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-serif text-xl font-medium text-foreground">No supervisors yet</h3>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
            Create an AI supervisor to automatically filter search results based on your specific research criteria.
          </p>
          <Button onClick={handleOpenNew} className="mt-6">Create your first supervisor</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {supervisors?.map(supervisor => (
            <Card 
              key={supervisor.id} 
              className={`flex flex-col transition-all ${supervisor.isActive ? 'border-primary shadow-sm ring-1 ring-primary/20' : 'hover:border-primary/50'}`}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="font-serif text-lg leading-tight flex items-center gap-2">
                    {supervisor.isActive && <Sparkles className="h-4 w-4 text-primary" />}
                    {supervisor.name}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleEdit(supervisor)}>
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => {
                      if(window.confirm('Delete this supervisor?')) deleteMutation.mutate({ id: supervisor.id });
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {supervisor.description && (
                  <CardDescription className="line-clamp-2 mt-1">{supervisor.description}</CardDescription>
                )}
              </CardHeader>
              
              <CardContent className="flex-1 space-y-4">
                {supervisor.constraints && supervisor.constraints.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase">Constraints</h4>
                    <ul className="text-sm space-y-1">
                      {supervisor.constraints.slice(0, 3).map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-foreground/80">
                          <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{c}</span>
                        </li>
                      ))}
                      {supervisor.constraints.length > 3 && (
                        <li className="text-xs text-muted-foreground pl-5">+ {supervisor.constraints.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}
                
                <div className="flex flex-wrap gap-2 pt-2">
                  {supervisor.focusAreas?.slice(0, 2).map((f, i) => (
                    <Badge key={i} variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                      {f}
                    </Badge>
                  ))}
                  {supervisor.minYear && (
                    <Badge variant="outline" className="text-muted-foreground">
                      &ge; {supervisor.minYear}
                    </Badge>
                  )}
                </div>
              </CardContent>
              
              <CardFooter className="pt-4 border-t bg-muted/20">
                {supervisor.isActive ? (
                  <div className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-primary">
                    <CheckCircle2 className="h-4 w-4" />
                    Active Supervisor
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={() => activateMutation.mutate({ id: supervisor.id })}
                    disabled={activateMutation.isPending}
                  >
                    <Circle className="h-4 w-4 mr-2 text-muted-foreground" />
                    Set as Active
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
