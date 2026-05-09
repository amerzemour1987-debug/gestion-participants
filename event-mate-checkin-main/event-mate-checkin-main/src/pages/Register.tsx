import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, Clock, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { sendConfirmationEmail } from "@/lib/brevo";

interface EventRow {
  id: string; title: string; subtitle: string; description: string;
  event_date: string | null; time_range: string; location: string;
  banner_url: string | null; logo_url: string | null; 
  program_url: string | null;
  email_template: string | null;
}
interface RoomRow {
  id: string; name: string; capacity: number | null; display_order: number;
  registered: number; time_slot: string | null;
}

const Register = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());
  const [loadingPage, setLoadingPage] = useState(true);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!slug) return;
      const { data: ev } = await supabase
        .from("events").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
      if (!ev) { setLoadingPage(false); return; }
      setEvent(ev as any);
      const { data: rs } = await supabase
        .from("rooms").select("*").eq("event_id", ev.id).order("display_order");
      const enriched: RoomRow[] = [];
      for (const r of rs ?? []) {
        const { count } = await supabase
          .from("registration_rooms")
          .select("*", { count: "exact", head: true })
          .eq("room_id", r.id);
        enriched.push({ ...(r as any), registered: count ?? 0 });
      }
      setRooms(enriched);
      if (enriched.length === 1) setSelectedRooms(new Set([enriched[0].id]));
      setLoadingPage(false);
    })();
  }, [slug]);

  const isFull = (r: RoomRow) => r.capacity !== null && r.registered >= r.capacity;

  const toggleRoom = (id: string) => {
    const room = rooms.find(r => r.id === id);
    if (!room) return;

    setSelectedRooms((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        // Anti-conflit : si cet atelier a un slot, on déselectionne les autres du même slot
        if (room.time_slot) {
          rooms.forEach(r => {
            if (r.time_slot === room.time_slot && n.has(r.id)) n.delete(r.id);
          });
        }
        n.add(id);
      }
      return n;
    });
  };

  const isSlotConflict = (r: RoomRow) => {
    if (!r.time_slot || selectedRooms.has(r.id)) return false;
    return rooms.some(other => selectedRooms.has(other.id) && other.time_slot === r.time_slot);
  };

  const validate = () => {
    const e: Record<string,string> = {};
    if (!form.firstName.trim()) e.firstName = "Requis";
    if (!form.lastName.trim()) e.lastName = "Requis";
    if (!form.email.trim()) e.email = "Requis";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Email invalide";
    if (!form.phone.trim()) e.phone = "Requis";
    if (rooms.length > 1 && selectedRooms.size === 0) e.rooms = "Sélectionnez au moins une salle";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !event) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("register_participant", {
      _event_id: event.id,
      _first_name: form.firstName.trim(),
      _last_name: form.lastName.trim(),
      _email: form.email.trim().toLowerCase(),
      _phone: form.phone.trim(),
      _room_ids: Array.from(selectedRooms),
    });
    setLoading(false);
    if (error) {
      toast({ title: "Inscription refusée", description: error.message, variant: "destructive" });
      return;
    }
    // Gestion robuste du résultat (tableau ou objet direct)
    const row = Array.isArray(data) ? data[0] : data;
    const selectedRoomNames = rooms.filter((r) => selectedRooms.has(r.id)).map((r) => r.name);
    
    // Send confirmation email (async, don't block navigation)
    sendConfirmationEmail({
      email: form.email.trim().toLowerCase(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      eventTitle: event.title,
      qrCode: row?.qr_code,
      rooms: selectedRoomNames,
      customTemplate: event.email_template,
    }).catch(err => console.error("Email sending failed:", err));

    navigate("/merci", {
      state: {
        firstName: form.firstName, lastName: form.lastName, email: form.email,
        qrCode: row?.qr_code, eventTitle: event.title, rooms: selectedRoomNames,
      },
    });
  };

  if (loadingPage) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Chargement…</div>;
  if (!event) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Événement introuvable</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Clean Banner Section */}
      <section className="relative h-[250px] md:h-[350px] overflow-hidden">
        {event.banner_url ? (
          <img 
            src={event.banner_url} 
            alt="" 
            className="w-full h-full object-cover" 
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-950" />
        )}
      </section>

      <section className="px-4 -mt-20 pb-24 relative z-20">
        <Card className="container max-w-lg mx-auto shadow-2xl border-white/10 bg-white/95 backdrop-blur-xl overflow-hidden rounded-[2.5rem]">
          <CardContent className="p-0">
            {/* Header inside Card */}
            <div className="bg-slate-50/50 p-8 md:p-10 border-b border-slate-100 text-center">
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">
                {event.title}
              </h1>
              
              {event.subtitle && (
                <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-xs text-indigo-600 mb-4">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="font-bold uppercase tracking-wider">{event.subtitle}</span>
                </div>
              )}

              {event.description && (
                <p className="text-sm text-slate-500 leading-relaxed max-w-md mx-auto mb-4">
                  {event.description}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {event.time_range && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-indigo-400" />
                    {event.time_range}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-indigo-400" />
                  Places limitées
                </span>
              </div>
            </div>

            <div className="p-8 md:p-10">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Inscription</h2>
                <p className="text-sm text-slate-400">Réservez votre place en quelques secondes.</p>
              </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fn">Prénom</Label>
                  <Input id="fn" value={form.firstName} onChange={(e) => setForm({...form, firstName: e.target.value})} className={errors.firstName?"border-destructive":""} />
                  {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ln">Nom</Label>
                  <Input id="ln" value={form.lastName} onChange={(e) => setForm({...form, lastName: e.target.value})} className={errors.lastName?"border-destructive":""} />
                  {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="em">Email</Label>
                <Input id="em" type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} className={errors.email?"border-destructive":""} />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ph">Téléphone</Label>
                <Input id="ph" type="tel" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className={errors.phone?"border-destructive":""} />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
              </div>

              {rooms.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-black uppercase tracking-widest text-slate-400">Choix des ateliers</Label>
                    {event.program_url && (
                      <Button variant="outline" size="sm" asChild className="h-8 rounded-full border-primary text-primary hover:bg-primary hover:text-white transition-all text-[10px] font-bold uppercase tracking-widest">
                        <a href={event.program_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3 w-3 mr-2" /> Programme
                        </a>
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-3">
                    {rooms.map((r) => {
                      const full = isFull(r);
                      const conflict = isSlotConflict(r);
                      const isSelected = selectedRooms.has(r.id);
                      return (
                        <label key={r.id} className={`flex items-start gap-4 p-4 border-2 rounded-2xl transition-all ${isSelected ? "border-primary bg-primary/5 shadow-md" : (full || conflict) ? "opacity-40 bg-slate-100 cursor-not-allowed" : "border-slate-100 hover:border-slate-200 cursor-pointer"}`}>
                          <Checkbox
                            checked={isSelected}
                            disabled={full || conflict}
                            onCheckedChange={() => !(full || conflict) && toggleRoom(r.id)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-bold text-slate-900 leading-tight">{r.name}</p>
                              {r.time_slot && (
                                <Badge variant="outline" className="text-[9px] uppercase tracking-tighter bg-white h-5">
                                  {r.time_slot}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">
                              {full ? "Complet" : conflict ? "Autre atelier choisi sur ce créneau" : 
                                r.capacity ? `${r.capacity - r.registered} places restantes` : "Inscriptions ouvertes"}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {errors.rooms && <p className="text-xs text-destructive">{errors.rooms}</p>}
                </div>
              )}

              <Button type="submit" variant="hero" size="lg" className="w-full text-base" disabled={loading}>
                {loading ? "Inscription en cours…" : "S'inscrire"}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </section>
    </div>
  );
};
export default Register;
