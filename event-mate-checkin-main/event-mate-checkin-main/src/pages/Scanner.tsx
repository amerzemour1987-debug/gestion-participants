import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Camera, CheckCircle, XCircle, Search, LogOut, CameraOff, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Html5Qrcode } from "html5-qrcode";

interface EventOpt { id: string; title: string; logo_url: string | null; }
interface RoomOpt { id: string; name: string; }
interface ScanResult {
  status: "ok" | "already" | "notreg" | "notfound";
  firstName?: string; lastName?: string; code?: string;
}

const Scanner = () => {
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
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }
      const { data } = await supabase.from("events").select("id,title,logo_url").eq("is_active", true).order("created_at", { ascending: false });
      setEvents((data ?? []) as any);
    })();
    return () => { if (scannerRef.current?.isScanning) scannerRef.current.stop().catch(() => {}); };
  }, [navigate]);

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
      .eq("qr_code", trimmed)
      .eq("event_id", event.id)
      .maybeSingle();

    if (!reg) { setResult({ status: "notfound", code: trimmed }); return; }
    const r: any = reg;
    const inscritIci = (r.registration_rooms ?? []).some((x: any) => x.room_id === room.id);
    if (!inscritIci) {
      setResult({ status: "notreg", firstName: r.first_name, lastName: r.last_name, code: r.qr_code });
      return;
    }
    // Check if already checked in this room
    const { data: existing } = await supabase
      .from("room_check_ins").select("id")
      .eq("registration_id", r.id).eq("room_id", room.id).maybeSingle();
    if (existing) {
      setResult({ status: "already", firstName: r.first_name, lastName: r.last_name, code: r.qr_code });
      return;
    }
    // Record check-in
    const { data: { user } } = await supabase.auth.getUser();
    const { error: insErr } = await supabase.from("room_check_ins").insert({
      registration_id: r.id, room_id: room.id, checked_in_by: user?.id,
    });
    if (insErr) { toast({ title: "Erreur", description: insErr.message, variant: "destructive" }); return; }
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
    await supabase.auth.signOut(); navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero px-4 py-4">
        <div className="container max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {event?.logo_url && <img src={event.logo_url} alt="" className="h-10 w-10 object-contain bg-white/90 rounded p-1" />}
            <div>
              <h1 className="text-lg font-bold text-primary-foreground">{event?.title ?? "Scanner"}</h1>
              <p className="text-xs text-primary-foreground/70">{room ? `Salle : ${room.name}` : "Sélectionnez un événement"}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-primary-foreground hover:bg-primary-foreground/20">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="container max-w-lg mx-auto px-4 py-6 space-y-4">
        {step === "event" && (
          <Card><CardContent className="p-4 space-y-2">
            <h2 className="font-semibold mb-2">Choisir l'événement</h2>
            {events.length === 0 && <p className="text-sm text-muted-foreground">Aucun événement actif.</p>}
            {events.map((e) => (
              <Button key={e.id} variant="outline" className="w-full justify-start" onClick={() => pickEvent(e)}>{e.title}</Button>
            ))}
          </CardContent></Card>
        )}

        {step === "room" && (
          <Card><CardContent className="p-4 space-y-2">
            <Button variant="ghost" size="sm" className="gap-1 mb-1" onClick={() => { setStep("event"); setEvent(null); }}><ArrowLeft className="h-4 w-4" /> Retour</Button>
            <h2 className="font-semibold mb-2">Choisir la salle à scanner</h2>
            {rooms.length === 0 && <p className="text-sm text-muted-foreground">Aucune salle pour cet événement.</p>}
            {rooms.map((r) => (
              <Button key={r.id} variant="outline" className="w-full justify-start" onClick={() => pickRoom(r)}>{r.name}</Button>
            ))}
          </CardContent></Card>
        )}

        {step === "scan" && (
          <>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setStep("room"); setRoom(null); setResult(null); }}><ArrowLeft className="h-4 w-4" /> Changer de salle</Button>
            <Card className="border-dashed border-2 border-primary/30 overflow-hidden">
              <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
                <div id="qr-reader" className={`w-full ${scanning ? "block" : "hidden"} rounded-lg overflow-hidden`} />
                {!scanning && (
                  <>
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"><Camera className="h-8 w-8 text-primary" /></div>
                    <p className="text-sm text-muted-foreground">Scannez un QR code avec la caméra ou saisissez-le manuellement</p>
                  </>
                )}
                {!scanning ? (
                  <Button onClick={startCamera} variant="hero" size="lg" className="w-full gap-2"><Camera className="h-4 w-4" /> Scanner avec la caméra</Button>
                ) : (
                  <Button onClick={stopCamera} variant="outline" size="lg" className="w-full gap-2"><CameraOff className="h-4 w-4" /> Arrêter</Button>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Input placeholder="Entrer le code QR…" value={manualCode} onChange={(e) => setManualCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleScan(manualCode)} />
              <Button onClick={() => handleScan(manualCode)} size="icon"><Search className="h-4 w-4" /></Button>
            </div>

            {result && (
              <Card className={
                result.status === "ok" ? "border-success/60" :
                result.status === "already" ? "border-primary/40" :
                "border-destructive/60"
              }>
                <CardContent className="p-6">
                  {result.status === "ok" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-success"><CheckCircle className="h-6 w-6" /><p className="font-semibold text-lg">Accès autorisé</p></div>
                      <p className="text-foreground">{result.firstName} {result.lastName}</p>
                      <p className="text-xs text-muted-foreground">Code : {result.code}</p>
                    </div>
                  )}
                  {result.status === "already" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2"><Badge>Déjà scanné</Badge></div>
                      <p className="text-foreground">{result.firstName} {result.lastName}</p>
                      <p className="text-xs text-muted-foreground">Cette personne a déjà été scannée pour {room?.name}.</p>
                    </div>
                  )}
                  {result.status === "notreg" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-destructive"><XCircle className="h-6 w-6" /><p className="font-semibold">Non inscrit à cette salle</p></div>
                      <p className="text-foreground">{result.firstName} {result.lastName}</p>
                      <p className="text-sm text-muted-foreground">Accès refusé pour {room?.name}.</p>
                    </div>
                  )}
                  {result.status === "notfound" && (
                    <div className="flex items-center gap-2 text-destructive"><XCircle className="h-6 w-6" /><p className="font-semibold">QR code invalide</p></div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};
export default Scanner;
