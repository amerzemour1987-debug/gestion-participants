import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Save, Plus, Trash2, Upload, Copy, ExternalLink, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface EventRow {
  id: string; title: string; subtitle: string; description: string;
  event_date: string | null; time_range: string; location: string;
  banner_url: string | null; banner_position: string; logo_url: string | null; 
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
  const copyLink = () => { navigator.clipboard.writeText(regUrl); toast({ title: "Lien copié" }); };

  const exportCsv = () => {
    const roomMap = Object.fromEntries(rooms.map((r) => [r.id, r.name]));
    const headers = ["Prénom","Nom","Email","Téléphone","Inscrit le","Salles inscrites","Présent dans"];
    const lines = regs.map((r) => [
      r.first_name, r.last_name, r.email, r.phone, r.created_at,
      r.registration_rooms.map((x) => roomMap[x.room_id]).filter(Boolean).join(" | "),
      r.room_check_ins.map((x) => roomMap[x.room_id]).filter(Boolean).join(" | "),
    ].map((v) => `"${String(v).replace(/"/g,'""')}"`).join(","));
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${ev.title}-backup-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    return true;
  };

  const deleteEvent = async () => {
    if (!confirm("ATTENTION : Cette action est irréversible. Un backup CSV sera téléchargé automatiquement et tous les fichiers associés seront supprimés. Confirmer la suppression ?")) return;
    
    setSaving(true);
    // 1. Auto-Backup
    exportCsv();

    // 2. Nettoyage Stockage (Storage)
    const { data: files } = await supabase.storage.from("event-assets").list(ev.id);
    if (files && files.length > 0) {
      const paths = files.map(f => `${ev.id}/${f.name}`);
      await supabase.storage.from("event-assets").remove(paths);
    }

    // 3. Suppression DB (Cascades are handled by DB schema)
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
      // Vérification ultra-précise de l'inscription dans la salle
      const isInscrit = r.registration_rooms?.some((x) => x.room_id === roomId);
      const isPresent = r.room_check_ins?.some((x) => x.room_id === roomId);
      
      if (isInscrit) registered++;
      if (isPresent) present++;
    });
    return { registered, present };
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild><Link to="/admin"><ArrowLeft className="h-4 w-4" /></Link></Button>
            <div>
              <h1 className="text-xl font-bold">{ev.title}</h1>
              <p className="text-sm text-muted-foreground">Configuration de l'événement</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="destructive" size="sm" onClick={deleteEvent} disabled={saving} className="gap-2">
              <Trash2 className="h-4 w-4" /> Supprimer
            </Button>
            <Button onClick={saveEvent} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" /> {saving ? "…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Lien d'inscription */}
        <Card>
          <CardHeader><CardTitle className="text-base">Lien d'inscription public</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input value={regUrl} readOnly />
            <Button variant="outline" size="icon" onClick={copyLink}><Copy className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" asChild><a href={regUrl} target="_blank"><ExternalLink className="h-4 w-4" /></a></Button>
          </CardContent>
        </Card>

        {/* Détails de l'événement */}
        <Card>
          <CardHeader><CardTitle className="text-base">Contenu de la page d'inscription</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Titre principal</Label><Input value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} /></div>
              <div><Label>Sous-titre / Date affichée</Label><Input value={ev.subtitle} onChange={(e) => setEv({ ...ev, subtitle: e.target.value })} /></div>
            </div>
            <div><Label>Description (texte de la zone bleue)</Label>
              <Textarea rows={4} value={ev.description} onChange={(e) => setEv({ ...ev, description: e.target.value })} />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div><Label>Date</Label><Input type="date" value={ev.event_date ?? ""} onChange={(e) => setEv({ ...ev, event_date: e.target.value })} /></div>
              <div><Label>Horaires</Label><Input value={ev.time_range} onChange={(e) => setEv({ ...ev, time_range: e.target.value })} /></div>
              <div><Label>Lieu</Label><Input value={ev.location} onChange={(e) => setEv({ ...ev, location: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Bannière + Logo */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Bannière (page d'inscription)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {ev.banner_url && <img src={ev.banner_url} alt="Bannière" className="w-full h-32 object-cover rounded-lg border" />}
              <label className="block">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAsset(e.target.files[0], "banner")} />
                <Button variant="outline" className="w-full gap-2" asChild><span><Upload className="h-4 w-4" /> Uploader une bannière</span></Button>
              </label>
              {ev.banner_url && (
                <div className="pt-2 space-y-1.5">
                  <Label className="text-xs">Cadrage de l'image (Haut / Centre / Bas)</Label>
                  <select 
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            <CardHeader><CardTitle className="text-base">Logo (page Scanner staff)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {ev.logo_url && <img src={ev.logo_url} alt="Logo" className="h-32 object-contain rounded-lg border bg-muted mx-auto" />}
              <label className="block">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAsset(e.target.files[0], "logo")} />
                <Button variant="outline" className="w-full gap-2" asChild><span><Upload className="h-4 w-4" /> Uploader un logo</span></Button>
              </label>
            </CardContent>
          </Card>
        </div>

        {/* Salles */}
        <Card>
          <CardHeader><CardTitle className="text-base">Salles / Ateliers</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Capacité vide = inscriptions illimitées. Si une salle est pleine, l'inscription affiche "Plus de place pour cette salle".
            </p>
            <div className="space-y-2">
              {rooms.map((r) => {
                const s = stats(r.id);
                return (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 p-3 border rounded-lg">
                    <Input className="flex-1 min-w-[160px]" defaultValue={r.name} onBlur={(e) => e.target.value !== r.name && updateRoom(r, { name: e.target.value })} />
                    <Input type="number" placeholder="Capacité (vide = illimité)" className="w-44"
                      defaultValue={r.capacity ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim() ? parseInt(e.target.value) : null;
                        if (v !== r.capacity) updateRoom(r, { capacity: v });
                      }} />
                    <Badge variant="secondary">Inscrits {s.registered}{r.capacity ? `/${r.capacity}` : ""}</Badge>
                    <Badge variant="default">Présents {s.present}</Badge>
                    <Button variant="ghost" size="icon" onClick={() => delRoom(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                );
              })}
              {rooms.length === 0 && <p className="text-sm text-muted-foreground">Aucune salle. Ajoutez-en une ci-dessous.</p>}
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Input placeholder="Nom de la salle (ex: Plénière, Atelier A)" className="flex-1 min-w-[200px]" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} />
              <Input type="number" placeholder="Capacité (optionnel)" className="w-44" value={newRoomCap} onChange={(e) => setNewRoomCap(e.target.value)} />
              <Button onClick={addRoom} className="gap-2"><Plus className="h-4 w-4" /> Ajouter</Button>
            </div>
          </CardContent>
        </Card>

        {/* Présence en temps réel */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Participants & présence (temps réel)</CardTitle>
              <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead className="hidden sm:table-cell">Email</TableHead>
                    {rooms.map((r) => <TableHead key={r.id} className="text-center">{r.name}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {regs.length === 0 ? (
                    <TableRow><TableCell colSpan={2 + rooms.length} className="text-center py-6 text-muted-foreground">Aucun inscrit</TableCell></TableRow>
                  ) : regs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.first_name} {r.last_name}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">{r.email}</TableCell>
                      {rooms.map((rm) => {
                        const inscrit = r.registration_rooms.some((x) => x.room_id === rm.id);
                        const present = r.room_check_ins.some((x) => x.room_id === rm.id);
                        return (
                          <TableCell key={rm.id} className="text-center">
                            {!inscrit ? <span className="text-muted-foreground">—</span>
                              : present ? <Badge>Présent</Badge>
                              : <Badge variant="secondary">Inscrit</Badge>}
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
      </main>
    </div>
  );
};
export default AdminEvent;
