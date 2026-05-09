import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Camera, CheckCircle, XCircle, Search, LogOut, CameraOff, ArrowLeft, User, MapPin, AlertTriangle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Html5Qrcode } from "html5-qrcode";

interface EventOpt { 
  id: string; title: string; logo_url: string | null; 
  banner_url: string | null;
}
interface RoomOpt { id: string; name: string; }
interface ScanResult {
  status: "ok" | "already" | "notreg" | "notfound";
  firstName?: string; lastName?: string; code?: string;
}

const Scanner = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<"event" | "room" | "scan">("event");
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [rooms, setRooms] = useState<RoomOpt[]>([]);
  const [event, setEvent] = useState<EventOpt | null>(null);
  const [room, setRoom] = useState<RoomOpt | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<string>("");

  useEffect(() => {
    const init = async () => {
      if (!id) {
        // Mode liste (nécessite connexion)
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: evs } = await supabase.from("events").select("*").eq("is_active", true).order("created_at", { ascending: false });
          setEvents((evs ?? []) as any);
          setStep("event");
        } else {
          navigate("/scanner/login");
        }
        return;
      }

      // Mode direct (Staff via lien)
      console.log("Tentative de chargement direct ID:", id);
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (ev) {
        setEvent(ev as any);
        const { data: rms } = await supabase
          .from("rooms")
          .select("*")
          .eq("event_id", ev.id)
          .order("display_order");
        
        setRooms((rms as any) ?? []);
        setStep("room");
      } else {
        console.error("Erreur chargement événement:", evErr);
        // Si l'ID est invalide ou bloqué, l'UI affichera "Événement introuvable"
      }
    };

    init();
    return () => { if (scannerRef.current?.isScanning) scannerRef.current.stop().catch(() => {}); };
  }, [id, navigate]);

  const pickEvent = async (e: EventOpt) => {
    setEvent(e);
    const { data } = await supabase.from("rooms").select("id,name").eq("event_id", e.id).order("display_order");
    setRooms((data ?? []) as any);
    setStep("room");
  };

  const pickRoom = (r: RoomOpt) => { setRoom(r); setStep("scan"); };

  const handleScan = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || !room || !event) return;
    setResult(null);

    const { data: reg } = await supabase
      .from("registrations")
      .select("id, first_name, last_name, qr_code, registration_rooms(room_id)")
      .ilike("qr_code", trimmed)
      .eq("event_id", event.id)
      .maybeSingle();

    if (!reg) { setResult({ status: "notfound", code: trimmed }); return; }
    const r: any = reg;
    const inscritIci = (r.registration_rooms ?? []).some((x: any) => x.room_id === room.id);
    if (!inscritIci) {
      setResult({ status: "notreg", firstName: r.first_name, lastName: r.last_name, code: r.qr_code });
      return;
    }
    const { data: existing } = await supabase
      .from("room_check_ins").select("id")
      .eq("registration_id", r.id).eq("room_id", room.id).maybeSingle();
    if (existing) {
      setResult({ status: "already", firstName: r.first_name, lastName: r.last_name, code: r.qr_code });
      return;
    }
    
    const { error: insErr } = await supabase.from("room_check_ins").insert({ registration_id: r.id, room_id: room.id });
    if (insErr) { 
      toast({ title: "Erreur", description: "Impossible d'enregistrer le scan.", variant: "destructive" }); 
      return; 
    }
    setResult({ status: "ok", firstName: r.first_name, lastName: r.last_name, code: r.qr_code });
  };

  const startCamera = async () => {
    setResult(null); setScanning(true);
    try {
      const s = new Html5Qrcode("qr-reader"); scannerRef.current = s;
      await s.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          if (text === lastScannedRef.current) return;
          lastScannedRef.current = text;
          handleScan(text);
          stopCamera();
        }, () => {});
    } catch {
      setScanning(false);
      toast({ title: "Caméra inaccessible", variant: "destructive" });
    }
  };
  const stopCamera = async () => {
    if (scannerRef.current?.isScanning) await scannerRef.current.stop().catch(() => {});
    scannerRef.current = null; setScanning(false);
    setTimeout(() => { lastScannedRef.current = ""; }, 1500);
  };

  const handleLogout = async () => {
    if (scannerRef.current?.isScanning) await scannerRef.current.stop().catch(() => {});
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Clean Banner Section for Scanner */}
      <header className="relative h-[200px] md:h-[300px] overflow-hidden">
        {event?.banner_url ? (
          <img 
            src={event.banner_url} 
            alt="" 
            className="w-full h-full object-cover" 
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-950" />
        )}
      </header>

      <main className="flex-1 container max-w-lg mx-auto px-4 py-8 space-y-6">
        {step === "event" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {id ? (
              <div className="text-center py-12 bg-white rounded-[2.5rem] shadow-xl border border-rose-100 p-8">
                <div className="mx-auto w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-4">
                  <AlertTriangle className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Événement introuvable</h2>
                <p className="text-slate-500 text-sm mb-6">Le lien utilisé semble invalide ou l'événement a été supprimé.</p>
                <Button variant="outline" className="rounded-xl" onClick={() => navigate("/")}>
                  Retour à l'accueil
                </Button>
              </div>
            ) : (
              <>
                <div className="text-center space-y-2 mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">Bienvenue</h2>
                  <p className="text-slate-500">Sélectionnez l'événement pour commencer le scan.</p>
                </div>
                <div className="grid gap-3">
                  {events.map((e) => (
                    <Button 
                      key={e.id} 
                      variant="outline" 
                      className="h-20 justify-start gap-4 px-6 bg-white hover:bg-slate-50 border-slate-200 hover:border-primary/50 shadow-sm transition-all group" 
                      onClick={() => pickEvent(e)}
                    >
                      <div className="h-10 w-10 rounded-lg bg-slate-100 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                        {e.logo_url ? <img src={e.logo_url} className="h-6 w-6 object-contain" /> : <Camera className="h-5 w-5 text-slate-400 group-hover:text-primary" />}
                      </div>
                      <span className="font-semibold text-slate-700 group-hover:text-slate-900">{e.title}</span>
                    </Button>
                  ))}
                  {events.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                      <p className="text-slate-400">Aucun événement actif trouvé</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {step === "room" && event && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="overflow-hidden border-none shadow-xl rounded-[2.5rem] bg-white/95 backdrop-blur-md">
              <CardContent className="p-0">
                <div className="bg-slate-50/80 p-8 border-b border-slate-100 flex flex-col items-center text-center">
                  <div className="h-20 w-20 rounded-2xl bg-white shadow-lg flex items-center justify-center overflow-hidden border border-slate-100 mb-4">
                    {event.logo_url ? (
                      <img src={event.logo_url} alt="" className="h-full w-full object-contain p-3" />
                    ) : (
                      <Camera className="h-10 w-10 text-slate-200" />
                    )}
                  </div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-1">{event.title}</h1>
                  <p className="text-xs font-bold text-primary uppercase tracking-[0.2em] opacity-70">Sélectionner un poste</p>
                </div>
                
                <div className="p-6 space-y-3">
                  {rooms.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-slate-400 text-sm">Aucun poste configuré</p>
                    </div>
                  ) : rooms.map((r) => (
                    <Button key={r.id} variant="outline" className="w-full h-16 justify-between text-lg font-bold rounded-2xl border-slate-100 hover:border-primary hover:bg-primary/5 hover:text-primary transition-all group" onClick={() => pickRoom(r)}>
                      <span className="truncate">{r.name}</span>
                      <Search className="h-5 w-5 text-slate-300 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Button variant="ghost" className="w-full text-slate-400 font-bold" onClick={() => id ? navigate("/") : setStep("event")}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Retour
            </Button>
          </div>
        )}

        {step === "scan" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" className="gap-2 text-slate-500 hover:text-slate-900 transition-colors" onClick={() => { setStep("room"); setRoom(null); setResult(null); }}>
                <ArrowLeft className="h-4 w-4" /> Changer de salle
              </Button>
              <div className="flex items-center gap-2 text-slate-400">
                <User className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Staff Actif</span>
              </div>
            </div>

            <Card className="overflow-hidden border-0 shadow-2xl bg-white">
              <CardContent className="p-0">
                <div className="relative aspect-square sm:aspect-video bg-slate-900 flex flex-col items-center justify-center overflow-hidden">
                  <div id="qr-reader" className={`w-full h-full ${scanning ? "block" : "hidden"}`} />
                  
                  {!scanning && (
                    <div className="flex flex-col items-center gap-6 p-12 text-center animate-in zoom-in-95 duration-300">
                      <div className="relative">
                        <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
                        <div className="relative w-24 h-24 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center">
                          <Camera className="h-10 w-10 text-primary" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold text-white">Prêt à scanner</h3>
                        <p className="text-slate-400 text-sm max-w-[200px]">Activez la caméra pour valider les participants.</p>
                      </div>
                    </div>
                  )}

                  <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-primary/50" />
                  <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-primary/50" />
                  <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-primary/50" />
                  <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-primary/50" />
                </div>
                
                <div className="p-6">
                  {!scanning ? (
                    <Button onClick={startCamera} variant="hero" size="lg" className="w-full h-14 rounded-xl text-lg shadow-xl shadow-primary/20">
                      Activer la caméra
                    </Button>
                  ) : (
                    <Button onClick={stopCamera} variant="outline" size="lg" className="w-full h-14 rounded-xl text-slate-600 border-slate-200">
                      <CameraOff className="h-5 w-5 mr-2" /> Arrêter la caméra
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Saisie manuelle</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Code du participant..." 
                    value={manualCode} 
                    onChange={(e) => setManualCode(e.target.value)} 
                    onKeyDown={(e) => e.key === "Enter" && handleScan(manualCode)} 
                    className="h-12 pl-10 rounded-xl bg-white border-slate-200 focus:border-primary shadow-sm"
                  />
                </div>
                <Button onClick={() => handleScan(manualCode)} className="h-12 w-12 rounded-xl shadow-lg" size="icon">
                  <Search className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {result && (
              <Card className={`animate-in zoom-in-95 slide-in-from-top-4 duration-300 shadow-2xl border-2 ${
                result.status === "ok" ? "border-emerald-500/50 bg-emerald-50/50" :
                result.status === "already" ? "border-amber-500/50 bg-amber-50/50" :
                "border-rose-500/50 bg-rose-50/50"
              } backdrop-blur-xl`}>
                <CardContent className="p-8 text-center">
                  {result.status === "ok" && (
                    <div className="space-y-4">
                      <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-inner">
                        <CheckCircle className="h-10 w-10" />
                      </div>
                      <div>
                        <p className="text-emerald-700 font-black text-2xl tracking-tight">ACCÈS AUTORISÉ</p>
                        <div className="mt-2 flex items-center justify-center gap-2 text-slate-900 font-bold text-lg">
                          <User className="h-5 w-5 text-slate-400" />
                          {result.firstName} {result.lastName}
                        </div>
                        <p className="text-slate-500 text-xs font-mono mt-1">ID: {result.code}</p>
                      </div>
                    </div>
                  )}
                  {result.status === "already" && (
                    <div className="space-y-4">
                      <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shadow-inner">
                        <CheckCircle className="h-10 w-10" />
                      </div>
                      <div>
                        <Badge variant="outline" className="border-amber-500 text-amber-700 mb-2 uppercase tracking-widest font-bold">DÉJÀ SCANNÉ</Badge>
                        <div className="flex items-center justify-center gap-2 text-slate-900 font-bold text-lg">
                          <User className="h-5 w-5 text-slate-400" />
                          {result.firstName} {result.lastName}
                        </div>
                        <p className="text-amber-700/70 text-sm mt-1 font-medium">Déjà enregistré pour cette salle.</p>
                      </div>
                    </div>
                  )}
                  {result.status === "notreg" && (
                    <div className="space-y-4">
                      <div className="mx-auto w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shadow-inner">
                        <XCircle className="h-10 w-10" />
                      </div>
                      <div>
                        <p className="text-rose-700 font-black text-2xl tracking-tight uppercase">NON INSCRIT</p>
                        <div className="mt-2 flex items-center justify-center gap-2 text-slate-900 font-bold text-lg">
                          <User className="h-5 w-5 text-slate-400" />
                          {result.firstName} {result.lastName}
                        </div>
                        <p className="text-rose-700/70 text-sm mt-1 font-medium">Accès refusé pour {room?.name}.</p>
                      </div>
                    </div>
                  )}
                  {result.status === "notfound" && (
                    <div className="space-y-4">
                      <div className="mx-auto w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shadow-inner">
                        <XCircle className="h-10 w-10" />
                      </div>
                      <div>
                        <p className="text-rose-700 font-black text-2xl tracking-tight uppercase">QR CODE INVALIDE</p>
                        <p className="text-slate-500 text-xs font-mono mt-1">Code inconnu : {result.code}</p>
                      </div>
                    </div>
                  )}
                  <Button onClick={() => setResult(null)} variant="ghost" className="mt-6 text-slate-500 font-bold">Effacer</Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>

      <footer className="py-6 text-center">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">© 2024 Broshing Events - Système de contrôle sécurisé</p>
      </footer>
    </div>
  );
};

export default Scanner;
