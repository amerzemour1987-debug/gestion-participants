import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, MapPin, Users, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { sendConfirmationEmail } from "@/lib/brevo";

interface EventRow {
  id: string; title: string; subtitle: string; description: string;
  event_date: string | null; time_range: string; location: string;
  banner_url: string | null;
}
interface RoomRow {
  id: string; name: string; capacity: number | null; display_order: number;
  registered: number;
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
      // Auto-select if only 1 room
      if (enriched.length === 1) setSelectedRooms(new Set([enriched[0].id]));
      setLoadingPage(false);
    })();
  }, [slug]);

  const isFull = (r: RoomRow) => r.capacity !== null && r.registered >= r.capacity;

  const toggleRoom = (id: string) => {
    setSelectedRooms((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
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
    const row = (data as any)?.[0];
    const selectedRoomNames = rooms.filter((r) => selectedRooms.has(r.id)).map((r) => r.name);
    
    // Send confirmation email (async, don't block navigation)
    sendConfirmationEmail({
      email: form.email.trim().toLowerCase(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      eventTitle: event.title,
      qrCode: row?.qr_code,
      rooms: selectedRoomNames,
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
    <div className="min-h-screen">
      <section className="relative px-4 py-20 md:py-32 overflow-hidden bg-slate-950">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] bg-accent/20 rounded-full blur-[120px] animate-pulse" />
        </div>
        
        {event.banner_url && (
          <img src={event.banner_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-overlay" />
        )}
        
        <div className="container max-w-4xl mx-auto text-center relative z-10">
          {event.subtitle && (
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 px-4 py-1.5 text-sm text-white mb-8 transition-transform hover:scale-105 duration-300">
              <Calendar className="h-4 w-4 text-accent" />
              <span className="font-medium">{event.subtitle}</span>
            </div>
          )}
          
          <h1 className="text-5xl md:text-7xl font-black text-white mb-6 tracking-tight leading-tight">
            {event.title.split(' ').map((word, i) => (
              <span key={i} className={i === 1 ? "text-gradient block md:inline" : ""}>
                {word}{' '}
              </span>
            ))}
          </h1>
          
          {event.description && (
            <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-10 whitespace-pre-line leading-relaxed">
              {event.description}
            </p>
          )}
          
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm font-medium text-slate-400">
            {event.time_range && (
              <span className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
                <Clock className="h-4 w-4 text-primary" />
                {event.time_range}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
                <MapPin className="h-4 w-4 text-primary" />
                {event.location}
              </span>
            )}
            <span className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
              <Users className="h-4 w-4 text-primary" />
              Places limitées
            </span>
          </div>
        </div>
      </section>

      <section className="px-4 -mt-12 pb-24 relative z-20">
        <Card className="container max-w-lg mx-auto shadow-2xl border-white/10 bg-white/80 backdrop-blur-xl">
          <CardContent className="p-8 md:p-12">
            <div className="mb-8 text-center sm:text-left">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">Inscription</h2>
              <p className="text-slate-500">Réservez votre place en quelques secondes.</p>
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

              {rooms.length > 1 && (
                <div className="space-y-2 pt-2">
                  <Label>Salles / ateliers</Label>
                  <div className="space-y-2">
                    {rooms.map((r) => {
                      const full = isFull(r);
                      return (
                        <label key={r.id} className={`flex items-start gap-3 p-3 border rounded-lg ${full ? "opacity-50 cursor-not-allowed bg-muted" : "cursor-pointer hover:bg-accent"}`}>
                          <Checkbox
                            checked={selectedRooms.has(r.id)}
                            disabled={full}
                            onCheckedChange={() => !full && toggleRoom(r.id)}
                          />
                          <div className="flex-1">
                            <p className="font-medium text-sm">{r.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {full ? "Plus de place pour cette salle" :
                                r.capacity ? `${r.registered}/${r.capacity} inscrits` : "Inscriptions ouvertes"}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {errors.rooms && <p className="text-xs text-destructive">{errors.rooms}</p>}
                </div>
              )}
              {rooms.length === 1 && (
                <p className="text-xs text-muted-foreground pt-1">Vous serez inscrit à : <strong>{rooms[0].name}</strong></p>
              )}

              <Button type="submit" variant="hero" size="lg" className="w-full text-base" disabled={loading}>
                {loading ? "Inscription en cours…" : "S'inscrire"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
export default Register;
