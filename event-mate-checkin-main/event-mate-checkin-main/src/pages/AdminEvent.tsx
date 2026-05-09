import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Save, Plus, Trash2, Upload, Copy, ExternalLink, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface EventRow {
  id: string; title: string; subtitle: string; description: string;
  event_date: string | null; time_range: string; location: string;
  banner_url: string | null; banner_position: string; logo_url: string | null; 
  email_template: string | null;
  slug: string; is_active: boolean;
}
interface RoomRow { id: string; name: string; capacity: number | null; display_order: number; }
interface RegRow {
  id: string; first_name: string; last_name: string; email: string; phone: string; created_at: string;
  registration_rooms: { room_id: string }[];
  room_check_ins: { room_id: string; checked_in_at: string }[];
}

const AdminEvent = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [ev, setEv] = useState<EventRow | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [regs, setRegs] = useState<RegRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomCap, setNewRoomCap] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
    setEv(e as any);
    const { data: r } = await supabase.from("rooms").select("*").eq("event_id", id).order("display_order");
    setRooms((r as any) ?? []);
    const { data: rg } = await supabase
      .from("registrations")
      .select("*, registration_rooms(room_id), room_check_ins(room_id, checked_in_at)")
      .eq("event_id", id)
      .order("created_at", { ascending: false });
    setRegs((rg as any) ?? []);
  }, [id]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }
      load();
    })();
    const ch = supabase
      .channel(`ev-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_check_ins" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "registration_rooms" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load, navigate]);

  if (!ev) return <div className="min-h-screen flex items-center justify-center">Chargement…</div>;

  const saveEvent = async () => {
    setSaving(true);
    const { error } = await supabase.from("events").update({
      title: ev.title, subtitle: ev.subtitle, description: ev.description,
      event_date: ev.event_date, time_range: ev.time_range, location: ev.location,
      is_active: ev.is_active, banner_position: ev.banner_position || 'center',
      email_template: ev.email_template,
    }).eq("id", ev.id);
    setSaving(false);
    toast({ title: error ? "Erreur" : "Enregistré", description: error?.message, variant: error ? "destructive" : "default" });
  };

  const uploadAsset = async (file: File, kind: "banner" | "logo") => {
    const path = `${ev.id}/${kind}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("event-assets").upload(path, file, { upsert: true });
    if (error) { toast({ title: "Upload erreur", description: error.message, variant: "destructive" }); return; }
    const { data } = supabase.storage.from("event-assets").getPublicUrl(path);
    const patch = kind === "banner" ? { banner_url: data.publicUrl } : { logo_url: data.publicUrl };
    await supabase.from("events").update(patch).eq("id", ev.id);
    setEv({ ...ev, ...patch });
    toast({ title: "Image mise à jour" });
  };

  const addRoom = async () => {
    if (!newRoomName.trim()) return;
    const cap = newRoomCap.trim() ? parseInt(newRoomCap) : null;
    const { error } = await supabase.from("rooms").insert({
      event_id: ev.id, name: newRoomName.trim(), capacity: cap, display_order: rooms.length,
    });
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else { setNewRoomName(""); setNewRoomCap(""); load(); }
  };

  const updateRoom = async (r: RoomRow, patch: Partial<RoomRow>) => {
    await supabase.from("rooms").update(patch).eq("id", r.id);
    load();
  };
  const delRoom = async (id: string) => {
    if (!confirm("Supprimer cette salle ?")) return;
    await supabase.from("rooms").delete().eq("id", id);
    load();
  };

  const regUrl = `${window.location.origin}/inscription/${ev.slug}`;
  const staffUrl = `${window.location.origin}/scanner/${ev.id}`;
  const copyLink = () => { navigator.clipboard.writeText(regUrl); toast({ title: "Lien copié" }); };
  const copyStaffLink = () => { navigator.clipboard.writeText(staffUrl); toast({ title: "Lien Staff copié" }); };

  const exportCsv = () => {
    const roomMap = Object.fromEntries(rooms.map((r) => [r.id, r.name]));
    // BOM for Excel UTF-8 support
    const BOM = "\uFEFF";
    const headers = ["Prénom", "Nom", "Email", "Téléphone", "Inscrit le", "Ateliers choisis", "Heures de Scan"];
    
    const lines = regs.map((r) => {
      const inscriptionDate = new Date(r.created_at).toLocaleString('fr-FR');
      
      const chosenRooms = r.registration_rooms
        .map((x) => roomMap[x.room_id])
        .filter(Boolean)
        .join(" | ");

      const scanDetails = r.room_check_ins
        .map((x) => {
          const roomName = roomMap[x.room_id];
          const scanTime = new Date(x.checked_in_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          return `${roomName} (${scanTime})`;
        })
        .filter(Boolean)
        .join(" | ");

      return [
        r.first_name, 
        r.last_name, 
        r.email, 
        r.phone, 
        inscriptionDate,
        chosenRooms,
        scanDetails
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";");
    });

    const csvContent = BOM + [headers.join(";"), ...lines].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ev.title}-Participants-${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  };

  const deleteEvent = async () => {
    if (!confirm("ATTENTION : Cette action est irréversible. Un backup CSV sera téléchargé automatiquement et tous les fichiers associés seront supprimés. Confirmer la suppression ?")) return;
    
    setSaving(true);
    exportCsv();
    const { data: files } = await supabase.storage.from("event-assets").list(ev.id);
    if (files && files.length > 0) {
      const paths = files.map(f => `${ev.id}/${f.name}`);
      await supabase.storage.from("event-assets").remove(paths);
    }
    const { error } = await supabase.from("events").delete().eq("id", ev.id);
    if (error) {
      toast({ title: "Erreur lors de la suppression", description: error.message, variant: "destructive" });
      setSaving(false);
    } else {
      toast({ title: "Événement supprimé", description: "Backup téléchargé et stockage nettoyé." });
      navigate("/admin");
    }
  };

  const stats = (roomId: string) => {
    let registered = 0, present = 0;
    if (!regs || regs.length === 0) return { registered: 0, present: 0 };
    regs.forEach((r) => {
      const rooms_list = r.registration_rooms ? (Array.isArray(r.registration_rooms) ? r.registration_rooms : [r.registration_rooms]) : [];
      const checks_list = r.room_check_ins ? (Array.isArray(r.room_check_ins) ? r.room_check_ins : [r.room_check_ins]) : [];
      const isInscrit = rooms_list.some((x: any) => x.room_id === roomId);
      const isPresent = checks_list.some((x: any) => x.room_id === roomId);
      if (isInscrit) registered++;
      if (isPresent) present++;
    });
    return { registered, present };
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild><Link to="/admin"><ArrowLeft className="h-4 w-4" /></Link></Button>
            <div>
              <h1 className="text-xl font-bold truncate max-w-[200px] sm:max-w-md">{ev.title}</h1>
              <p className="text-xs text-muted-foreground">Tableau de bord de l'événement</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="destructive" size="sm" onClick={deleteEvent} disabled={saving} className="hidden sm:flex gap-2">
              <Trash2 className="h-4 w-4" /> Supprimer
            </Button>
            <Button onClick={saveEvent} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" /> {saving ? "…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-6">
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full h-auto gap-1 bg-muted p-1">
            <TabsTrigger value="general" className="py-2.5">Général</TabsTrigger>
            <TabsTrigger value="rooms" className="py-2.5">Salles</TabsTrigger>
            <TabsTrigger value="design" className="py-2.5">Design</TabsTrigger>
            <TabsTrigger value="email" className="py-2.5">Email</TabsTrigger>
            <TabsTrigger value="data" className="py-2.5">Participants</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 animate-in fade-in duration-300">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Lien d'inscription public</CardTitle>
                <p className="text-xs text-muted-foreground">À partager avec vos participants pour qu'ils s'inscrivent.</p>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Input value={regUrl} readOnly className="bg-muted" />
                <Button variant="outline" size="icon" onClick={copyLink}><Copy className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" asChild><a href={regUrl} target="_blank"><ExternalLink className="h-4 w-4" /></a></Button>
              </CardContent>
            </Card>

            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <CardTitle className="text-base text-primary">Lien Scanner Staff (Accès direct)</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground">Envoyez ce lien à vos hôtesses sur WhatsApp. Pas besoin de mot de passe.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
                  <div className="h-48 w-48 bg-white p-3 rounded-2xl border-4 border-primary/20 shadow-xl shrink-0">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(staffUrl)}`} 
                      alt="QR Code Staff" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex-1 w-full space-y-4">
                    <div className="flex gap-2">
                      <Input value={staffUrl} readOnly className="h-12 bg-white/50 border-primary/20 text-sm" />
                      <Button variant="default" size="icon" className="h-12 w-12" onClick={copyStaffLink}><Copy className="h-5 w-5" /></Button>
                      <Button variant="outline" size="icon" className="h-12 w-12" asChild><a href={staffUrl} target="_blank"><ExternalLink className="h-5 w-5" /></a></Button>
                    </div>
                    <div className="bg-primary/10 p-4 rounded-xl border border-primary/20">
                      <p className="text-sm text-primary font-bold mb-1">🚀 Accès Rapide Staff</p>
                      <p className="text-xs text-primary/80 leading-relaxed">
                        Faites scanner ce QR Code par vos hôtesses à leur arrivée. 
                        Il ouvre directement le scanner pour cet événement sans demander de mot de passe.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Contenu de la page</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div><Label>Titre principal</Label><Input value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} /></div>
                  <div><Label>Sous-titre / Date affichée</Label><Input value={ev.subtitle} onChange={(e) => setEv({ ...ev, subtitle: e.target.value })} /></div>
                </div>
                <div><Label>Description (zone bleue)</Label>
                  <Textarea rows={4} value={ev.description} onChange={(e) => setEv({ ...ev, description: e.target.value })} />
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div><Label>Date</Label><Input type="date" value={ev.event_date ?? ""} onChange={(e) => setEv({ ...ev, event_date: e.target.value })} /></div>
                  <div><Label>Horaires</Label><Input value={ev.time_range} onChange={(e) => setEv({ ...ev, time_range: e.target.value })} /></div>
                  <div><Label>Lieu</Label><Input value={ev.location} onChange={(e) => setEv({ ...ev, location: e.target.value })} /></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rooms" className="space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((r) => {
                const s = stats(r.id);
                const percent = r.capacity ? Math.round((s.registered / r.capacity) * 100) : 0;
                const color = percent > 90 ? "bg-red-500" : percent > 70 ? "bg-orange-500" : "bg-emerald-500";
                
                return (
                  <Card key={`stat-${r.id}`} className="overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <p className="font-bold text-sm truncate pr-2">{r.name}</p>
                        <Badge variant={percent >= 100 ? "destructive" : "secondary"} className="text-[10px]">
                          {percent}%
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{s.registered} inscrits</span>
                          <span>{r.capacity ? `${r.capacity} places` : "Illimité"}</span>
                        </div>
                        <Progress value={r.capacity ? percent : 100} className="h-1.5" indicatorClassName={r.capacity ? color : "bg-primary"} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Gestion des Salles / Ateliers</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {rooms.map((r) => {
                    const s = stats(r.id);
                    return (
                      <div key={r.id} className="flex flex-wrap items-center gap-2 p-3 border rounded-lg bg-card">
                        <Input className="flex-1 min-w-[160px]" defaultValue={r.name} onBlur={(e) => e.target.value !== r.name && updateRoom(r, { name: e.target.value })} />
                        <Input type="number" placeholder="Capacité" className="w-24"
                          defaultValue={r.capacity ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim() ? parseInt(e.target.value) : null;
                            if (v !== r.capacity) updateRoom(r, { capacity: v });
                          }} />
                        <div className="flex gap-1">
                          <Badge variant="secondary" className="text-[10px]">Inscrits {s.registered}</Badge>
                          <Badge variant="default" className="text-[10px]">Présents {s.present}</Badge>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => delRoom(r.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Input placeholder="Nouvelle salle..." className="flex-1 min-w-[200px]" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} />
                  <Input type="number" placeholder="Capacité" className="w-24" value={newRoomCap} onChange={(e) => setNewRoomCap(e.target.value)} />
                  <Button onClick={addRoom} className="gap-2"><Plus className="h-4 w-4" /> Ajouter</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="design" className="space-y-6 animate-in fade-in duration-300">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Bannière</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {ev.banner_url && <img src={ev.banner_url} alt="" className="w-full h-32 object-cover rounded-lg border" />}
                  <label className="block">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAsset(e.target.files[0], "banner")} />
                    <Button variant="outline" className="w-full gap-2" asChild><span><Upload className="h-4 w-4" /> Uploader</span></Button>
                  </label>
                  {ev.banner_url && (
                    <div className="pt-2 space-y-1.5">
                      <Label className="text-xs">Cadrage de l'image</Label>
                      <select 
                        className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none"
                        value={ev.banner_position || "center"}
                        onChange={(e) => setEv({ ...ev, banner_position: e.target.value })}
                      >
                        <option value="top">Haut</option>
                        <option value="center">Centre</option>
                        <option value="bottom">Bas</option>
                      </select>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Logo</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {ev.logo_url && <img src={ev.logo_url} alt="" className="h-32 object-contain rounded-lg border bg-muted mx-auto" />}
                  <label className="block">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAsset(e.target.files[0], "logo")} />
                    <Button variant="outline" className="w-full gap-2" asChild><span><Upload className="h-4 w-4" /> Uploader</span></Button>
                  </label>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="email" className="space-y-6 animate-in fade-in duration-300">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Message de confirmation</CardTitle>
                <p className="text-sm text-muted-foreground">Texte envoyé par email après chaque inscription.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea 
                  rows={8} 
                  placeholder="Bonjour {{prenom}}, ..." 
                  value={ev.email_template ?? ""} 
                  onChange={(e) => setEv({ ...ev, email_template: e.target.value })} 
                />
                <div className="bg-muted p-4 rounded-xl text-[10px] space-y-2">
                  <p className="font-bold uppercase tracking-wider opacity-60">Variables disponibles :</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="flex flex-col"><code className="text-primary font-bold">{"{{prenom}}"}</code><span>Prénom</span></div>
                    <div className="flex flex-col"><code className="text-primary font-bold">{"{{nom}}"}</code><span>Nom</span></div>
                    <div className="flex flex-col"><code className="text-primary font-bold">{"{{evenement}}"}</code><span>Événement</span></div>
                    <div className="flex flex-col"><code className="text-primary font-bold">{"{{salles}}"}</code><span>Ateliers</span></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-6 animate-in fade-in duration-300">
            {/* État de remplissage visuel (rappel ici aussi) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((r) => {
                const s = stats(r.id);
                const percent = r.capacity ? Math.round((s.registered / r.capacity) * 100) : 0;
                const color = percent > 90 ? "bg-red-500" : percent > 70 ? "bg-orange-500" : "bg-emerald-500";
                return (
                  <div key={`stat-data-${r.id}`} className="bg-card border rounded-lg p-3 flex flex-col justify-center space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase opacity-60 truncate">{r.name}</span>
                      <span className="text-[10px] font-bold">{percent}%</span>
                    </div>
                    <Progress value={r.capacity ? percent : 100} className="h-1" indicatorClassName={r.capacity ? color : "bg-primary"} />
                  </div>
                );
              })}
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Participants & Présence</CardTitle>
                  <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom complet</TableHead>
                        <TableHead className="hidden sm:table-cell">Email</TableHead>
                        {rooms.map((r) => <TableHead key={r.id} className="text-center">{r.name}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {regs.length === 0 ? (
                        <TableRow><TableCell colSpan={2 + rooms.length} className="text-center py-10 text-muted-foreground italic">Aucun inscrit pour le moment</TableCell></TableRow>
                      ) : regs.map((r) => (
                        <TableRow key={r.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{r.first_name} {r.last_name}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">{r.email}</TableCell>
                          {rooms.map((rm) => {
                            const inscrit = r.registration_rooms.some((x) => x.room_id === rm.id);
                            const present = r.room_check_ins.some((x) => x.room_id === rm.id);
                            return (
                              <TableCell key={rm.id} className="text-center">
                                {!inscrit ? <span className="text-slate-300">—</span>
                                  : present ? <Badge className="bg-emerald-500 hover:bg-emerald-600">Présent</Badge>
                                  : <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100">Inscrit</Badge>}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};
export default AdminEvent;
