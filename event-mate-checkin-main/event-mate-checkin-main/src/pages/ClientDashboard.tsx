import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Download, UserCheck, Wifi, WifiOff, Search, Lock, Users, BarChart3 } from "lucide-react";

interface EventData {
  id: string; title: string; subtitle: string;
  event_date: string | null; location: string;
  banner_url: string | null; logo_url: string | null;
  client_pin: string | null;
}
interface RoomData { id: string; name: string; capacity: number | null; }
interface RegData {
  id: string; first_name: string; last_name: string; email: string;
  registration_rooms: { room_id: string }[];
  room_check_ins: { room_id: string; checked_in_at: string }[];
}

const ClientDashboard = () => {
  const { eventId } = useParams<{ eventId: string }>();

  const [authenticated, setAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [shaking, setShaking] = useState(false);

  const [event, setEvent] = useState<EventData | null>(null);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [regs, setRegs] = useState<RegData[]>([]);
  const [lastScans, setLastScans] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Check sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem(`client-auth-${eventId}`);
    if (stored === "true") setAuthenticated(true);
  }, [eventId]);

  const loadData = useCallback(async () => {
    if (!eventId) return;
    const { data: ev } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
    if (!ev) { setLoading(false); return; }
    setEvent(ev as any);

    const { data: rms } = await supabase.from("rooms").select("*").eq("event_id", eventId).order("display_order");
    setRooms((rms as any) ?? []);

    const { data: rg } = await supabase
      .from("registrations")
      .select("id, first_name, last_name, email, registration_rooms(room_id), room_check_ins(room_id, checked_in_at)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    setRegs((rg as any) ?? []);

    // Last scan per room
    const roomIds = ((rms ?? []) as RoomData[]).map((r) => r.id);
    if (roomIds.length > 0) {
      const { data: scans } = await supabase
        .from("room_check_ins").select("room_id, checked_in_at")
        .in("room_id", roomIds).order("checked_in_at", { ascending: false });
      const map: Record<string, string> = {};
      (scans ?? []).forEach((s: any) => { if (!map[s.room_id]) map[s.room_id] = s.checked_in_at; });
      setLastScans(map);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    loadData();
    const ch = supabase.channel(`client-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_check_ins" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "registration_rooms" }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [eventId, loadData]);

  // Auto-validate when 4 digits entered
  useEffect(() => {
    if (pinInput.length === 4 && event) {
      if (pinInput === event.client_pin) {
        sessionStorage.setItem(`client-auth-${eventId}`, "true");
        setAuthenticated(true);
        setPinError(false);
      } else {
        setShaking(true);
        setPinError(true);
        setTimeout(() => { setPinInput(""); setShaking(false); }, 700);
      }
    }
  }, [pinInput, event, eventId]);

  const handlePinDigit = (d: string) => {
    if (pinInput.length < 4 && !shaking) {
      setPinInput((p) => p + d);
      setPinError(false);
    }
  };

  const roomStats = (roomId: string) => {
    let registered = 0, present = 0;
    regs.forEach((r) => {
      const inscrit = r.registration_rooms?.some((x: any) => x.room_id === roomId);
      const here = r.room_check_ins?.some((x: any) => x.room_id === roomId);
      if (inscrit) registered++;
      if (here) present++;
    });
    return { registered, present };
  };

  const isScanActive = (roomId: string) => {
    const ls = lastScans[roomId];
    if (!ls) return false;
    return Date.now() - new Date(ls).getTime() < 30 * 60 * 1000;
  };

  const formatLastScan = (roomId: string) => {
    const ls = lastScans[roomId];
    if (!ls) return "Aucun scan";
    return new Date(ls).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  const exportCsv = () => {
    if (!event) return;
    const roomMap = Object.fromEntries(rooms.map((r) => [r.id, r.name]));
    const BOM = "\uFEFF";
    const headers = ["Prénom", "Nom", "Email", "Ateliers choisis", "Heures de Scan"];
    const lines = regs.map((r) => {
      const chosen = r.registration_rooms.map((x) => roomMap[x.room_id]).filter(Boolean).join(" | ");
      const scans = r.room_check_ins.map((x) => `${roomMap[x.room_id]} (${new Date(x.checked_in_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})`).filter(Boolean).join(" | ");
      return [r.first_name, r.last_name, r.email, chosen, scans].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";");
    });
    const blob = new Blob([BOM + [headers.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${event.title}-${new Date().toLocaleDateString("fr-FR").replace(/\//g, "-")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const totalPresent = regs.filter((r) => r.room_check_ins?.length > 0).length;
  const attendanceRate = regs.length > 0 ? Math.round((totalPresent / regs.length) * 100) : 0;
  const filteredRegs = regs.filter((r) => {
    const q = search.toLowerCase();
    return r.first_name.toLowerCase().includes(q) || r.last_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
  });

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
        <p className="text-slate-500 font-medium animate-pulse">Chargement...</p>
      </div>
    </div>
  );

  if (!event) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 text-sm">Événement introuvable.</p>
    </div>
  );

  if (!event.client_pin) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 text-sm">Dashboard client non configuré par l'administrateur.</p>
    </div>
  );

  /* ─── PIN SCREEN ─── */
  if (!authenticated) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {event.banner_url && (
        <div className="absolute inset-0">
          <img src={event.banner_url} alt="" className="w-full h-full object-cover opacity-10 blur-sm" />
        </div>
      )}
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          {event.logo_url ? (
            <div className="mx-auto w-20 h-20 rounded-2xl bg-white shadow-2xl flex items-center justify-center overflow-hidden mb-4 border border-white/20">
              <img src={event.logo_url} alt="" className="w-full h-full object-contain p-2" />
            </div>
          ) : (
            <div className="mx-auto w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center mb-4">
              <BarChart3 className="h-9 w-9 text-white/60" />
            </div>
          )}
          <h1 className="text-2xl font-black text-white tracking-tight">{event.title}</h1>
          <p className="text-slate-400 text-sm mt-1">Tableau de bord client</p>
        </div>

        <div className={`bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl transition-transform ${shaking ? "animate-bounce" : ""}`}>
          <div className="flex items-center justify-center gap-2 mb-6">
            <Lock className="h-4 w-4 text-slate-300" />
            <p className="text-slate-300 text-sm font-semibold tracking-wide">Code PIN à 4 chiffres</p>
          </div>

          {/* PIN dots */}
          <div className="flex justify-center gap-3 mb-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center text-2xl font-black transition-all duration-200 ${
                pinInput.length > i
                  ? pinError ? "border-red-400 bg-red-400/20 text-red-300" : "border-white bg-white/20 text-white scale-105"
                  : "border-white/20 bg-white/5"
              }`}>
                {pinInput.length > i ? "●" : ""}
              </div>
            ))}
          </div>
          {pinError && <p className="text-red-400 text-center text-xs font-medium mb-4 animate-in fade-in">Code incorrect. Réessayez.</p>}
          <div className="mb-6" />

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button key={n} onClick={() => handlePinDigit(String(n))}
                className="h-14 rounded-2xl bg-white/10 hover:bg-white/25 active:scale-90 text-white font-bold text-xl transition-all border border-white/10">
                {n}
              </button>
            ))}
            <div />
            <button onClick={() => handlePinDigit("0")}
              className="h-14 rounded-2xl bg-white/10 hover:bg-white/25 active:scale-90 text-white font-bold text-xl transition-all border border-white/10">
              0
            </button>
            <button onClick={() => { setPinInput((p) => p.slice(0, -1)); setPinError(false); }}
              className="h-14 rounded-2xl bg-white/10 hover:bg-white/25 active:scale-90 text-white font-bold text-xl transition-all border border-white/10">
              ⌫
            </button>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">Broshing Events · Accès sécurisé</p>
      </div>
    </div>
  );

  /* ─── DASHBOARD ─── */
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="relative h-36 overflow-hidden bg-slate-900">
        {event.banner_url && <img src={event.banner_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-transparent" />
        <div className="relative h-full container max-w-5xl mx-auto px-4 flex items-center gap-4">
          {event.logo_url && (
            <div className="w-14 h-14 rounded-xl bg-white shadow-lg flex items-center justify-center overflow-hidden shrink-0 border border-white/20">
              <img src={event.logo_url} alt="" className="w-full h-full object-contain p-1.5" />
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-black text-white tracking-tight">{event.title}</h1>
            <p className="text-xs text-slate-300 mt-0.5">
              {event.event_date ? new Date(event.event_date).toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : ""}
              {event.location ? ` · ${event.location}` : ""}
            </p>
          </div>
          <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold gap-1.5 px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            EN DIRECT
          </Badge>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Stats par salle */}
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Statistiques par salle</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => {
              const s = roomStats(room.id);
              const rate = s.registered > 0 ? Math.round((s.present / s.registered) * 100) : 0;
              const percent = room.capacity ? Math.min(Math.round((s.registered / room.capacity) * 100), 100) : 0;
              const active = isScanActive(room.id);
              const barColor = percent >= 100 ? "bg-red-500" : percent > 70 ? "bg-orange-500" : "bg-emerald-500";

              return (
                <Card key={room.id} className="border-0 shadow-sm overflow-hidden">
                  <CardContent className="p-0">
                    {/* En-tête salle */}
                    <div className={`px-4 py-2.5 flex items-center justify-between ${active ? "bg-emerald-50 border-b border-emerald-100" : "bg-slate-50 border-b border-slate-100"}`}>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-800 text-sm truncate">{room.name}</p>
                        {room.capacity && (
                          <Badge className={`shrink-0 border-0 font-bold text-[10px] px-1.5 py-0 leading-none h-4 flex items-center ${percent >= 100 ? "bg-red-100 text-red-700" : percent > 70 ? "bg-orange-100 text-orange-700" : "bg-slate-200 text-slate-600"}`}>
                            {percent}%
                          </Badge>
                        )}
                      </div>
                      <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-400"}`}>
                        {active ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                        <span>{active ? "Scan actif" : formatLastScan(room.id)}</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {room.capacity ? (
                      <div className="px-4 py-2 border-b border-slate-100 bg-white">
                        <Progress value={percent} className="h-1.5" indicatorClassName={barColor} />
                        <p className="text-[10px] text-slate-500 mt-1">{s.registered} inscrits / {room.capacity} places</p>
                      </div>
                    ) : (
                      <div className="px-4 py-2 border-b border-slate-100 bg-white">
                        <p className="text-[10px] text-slate-500 mt-1">{s.registered} inscrits · Capacité illimitée</p>
                      </div>
                    )}

                    {/* Chiffres */}
                    <div className="grid grid-cols-3 divide-x divide-slate-100 bg-white">
                      <div className="p-3 flex flex-col items-center gap-0.5">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <p className="text-xl font-black text-slate-800">{s.registered}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Inscrits</p>
                      </div>
                      <div className="p-3 flex flex-col items-center gap-0.5">
                        <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                        <p className={`text-xl font-black ${s.present > 0 ? "text-emerald-600" : "text-slate-300"}`}>{s.present}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Présents</p>
                      </div>
                      <div className="p-3 flex flex-col items-center gap-0.5">
                        <BarChart3 className="h-3.5 w-3.5 text-slate-400" />
                        <p className={`text-xl font-black ${rate >= 80 ? "text-emerald-600" : rate >= 50 ? "text-orange-500" : "text-slate-600"}`}>{rate}%</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Présence</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Participants table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">
                Participants
                <span className="ml-2 text-sm font-normal text-slate-400">({filteredRegs.length})</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 w-44 text-sm" />
                </div>
                <Button variant="outline" size="sm" className="gap-2 h-9 shrink-0" onClick={exportCsv}>
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="font-bold text-slate-600">Nom complet</TableHead>
                    <TableHead className="hidden sm:table-cell font-bold text-slate-600">Email</TableHead>
                    {rooms.map((r) => (
                      <TableHead key={r.id} className="text-center font-bold text-slate-600 text-xs">{r.name}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRegs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2 + rooms.length} className="text-center py-12 text-slate-400 italic">
                        Aucun participant trouvé
                      </TableCell>
                    </TableRow>
                  ) : filteredRegs.map((r) => (
                    <TableRow key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="font-semibold text-slate-800">{r.first_name} {r.last_name}</TableCell>
                      <TableCell className="hidden sm:table-cell text-slate-500 text-sm">{r.email}</TableCell>
                      {rooms.map((rm) => {
                        const inscrit = r.registration_rooms?.some((x: any) => x.room_id === rm.id);
                        const present = r.room_check_ins?.some((x: any) => x.room_id === rm.id);
                        return (
                          <TableCell key={rm.id} className="text-center">
                            {!inscrit
                              ? <span className="text-slate-200 text-lg">—</span>
                              : present
                                ? <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[10px] px-2 py-0.5 font-bold">✓ Présent</Badge>
                                : <Badge variant="secondary" className="bg-blue-50 text-blue-700 border border-blue-100 text-[10px] px-2 py-0.5">Inscrit</Badge>
                            }
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

      <footer className="py-6 text-center border-t border-slate-100 mt-8">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">Broshing Events · Accès client sécurisé</p>
      </footer>
    </div>
  );
};

export default ClientDashboard;
