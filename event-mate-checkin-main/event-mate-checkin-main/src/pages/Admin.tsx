import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, LogOut, Settings, ExternalLink, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface EventRow {
  id: string; title: string; subtitle: string; slug: string; is_active: boolean;
  event_date: string | null;
}

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Record<string,{regs:number,rooms:number}>>({});
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("events").select("*").order("created_at", { ascending: false });
    const evs = (data ?? []) as any;
    setEvents(evs);
    const m: Record<string,{regs:number,rooms:number}> = {};
    for (const e of evs) {
      const [{ count: rc }, { count: rmc }] = await Promise.all([
        supabase.from("registrations").select("*", { count: "exact", head: true }).eq("event_id", e.id),
        supabase.from("rooms").select("*", { count: "exact", head: true }).eq("event_id", e.id),
      ]);
      m[e.id] = { regs: rc ?? 0, rooms: rmc ?? 0 };
    }
    setCounts(m);
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }
      load();
    })();
  }, [navigate]);

  const createEvent = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.from("events").insert({ title: newTitle.trim() }).select().maybeSingle();
    setCreating(false);
    if (error || !data) { toast({ title: "Erreur", description: error?.message, variant: "destructive" }); return; }
    setNewTitle("");
    navigate(`/admin/events/${data.id}`);
  };

  const delEvent = async (id: string) => {
    if (!confirm("Supprimer cet événement et toutes ses inscriptions ?")) return;
    await supabase.from("events").delete().eq("id", id);
    load();
  };

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Dashboard Admin</h1>
            <p className="text-sm text-muted-foreground">Gestion des événements</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2"><LogOut className="h-4 w-4" /> Déconnexion</Button>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Créer un nouvel événement</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input placeholder="Nom de l'événement" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createEvent()} />
            <Button onClick={createEvent} disabled={creating} className="gap-2"><Plus className="h-4 w-4" /> Créer</Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {events.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucun événement</p>
          ) : events.map((e) => (
            <Card key={e.id}>
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{e.title}</h3>
                    {!e.is_active && <Badge variant="secondary">Inactif</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{e.subtitle || e.event_date || "—"}</p>
                </div>
                <Badge variant="outline">{counts[e.id]?.rooms ?? 0} salle(s)</Badge>
                <Badge>{counts[e.id]?.regs ?? 0} inscrit(s)</Badge>
                <Button variant="outline" size="sm" asChild className="gap-2">
                  <a href={`/inscription/${e.slug}`} target="_blank"><ExternalLink className="h-4 w-4" /> Lien</a>
                </Button>
                <Button variant="default" size="sm" asChild className="gap-2">
                  <Link to={`/admin/events/${e.id}`}><Settings className="h-4 w-4" /> Gérer</Link>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => delEvent(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};
export default Admin;
