import { useLocation, Navigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowLeft, Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useRef } from "react";
import jsPDF from "jspdf";

const ThankYou = () => {
  const location = useLocation();
  const state = location.state as {
    firstName?: string;
    lastName?: string;
    email?: string;
    qrCode?: string;
    eventTitle?: string;
    rooms?: string[];
  } | null;
  const qrRef = useRef<HTMLDivElement>(null);

  if (!state?.firstName || !state?.qrCode) return <Navigate to="/" replace />;

  const fullName = `${state.firstName ?? ""} ${state.lastName ?? ""}`.trim();

  const handleDownloadBadge = async () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;

    // Convert SVG → PNG via canvas for high-quality embed in PDF
    const svgString = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
    });

    const canvas = document.createElement("canvas");
    const size = 600;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    const pngData = canvas.toDataURL("image/png");
    URL.revokeObjectURL(url);

    // Badge format: 8 cm large × 12 cm haut
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "cm",
      format: [8, 12],
    });

    // Bordure
    pdf.setDrawColor(200);
    pdf.setLineWidth(0.05);
    pdf.rect(0.3, 0.3, 7.4, 11.4);

    // Titre événement
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("PARTICIPANT", 4, 1.3, { align: "center" });

    pdf.setDrawColor(150);
    pdf.setLineWidth(0.02);
    pdf.line(1, 1.7, 7, 1.7);

    // Nom complet (grand)
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    const nameLines = pdf.splitTextToSize(fullName, 7);
    pdf.text(nameLines, 4, 3, { align: "center" });

    // QR code centré
    const qrSize = 6;
    pdf.addImage(pngData, "PNG", (8 - qrSize) / 2, 4.5, qrSize, qrSize);

    // Code en bas
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(state.qrCode!, 4, 11.1, { align: "center" });

    pdf.save(`badge-${fullName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 gradient-hero-subtle">
      <Card className="max-w-md w-full shadow-xl border-0">
        <CardContent className="p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-success" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Merci, {state.firstName} !
            </h1>
            <p className="text-muted-foreground text-sm">
              Votre inscription a bien été enregistrée. Un email de confirmation
              sera envoyé à <strong className="text-foreground">{state.email}</strong>.
            </p>
            {state.rooms && state.rooms.length > 0 && (
              <p className="text-sm text-muted-foreground mt-3">
                Salles : <strong className="text-foreground">{state.rooms.join(", ")}</strong>
              </p>
            )}
          </div>

          <div ref={qrRef} className="bg-muted rounded-xl p-6 inline-block">
            <QRCodeSVG
              value={state.qrCode}
              size={180}
              level="H"
              className="mx-auto"
            />
            <p className="text-xs text-muted-foreground mt-3">
              Votre QR code d'accès
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            Présentez ce QR code à l'entrée de l'événement.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleDownloadBadge} variant="hero" className="gap-2">
              <Download className="h-4 w-4" /> Télécharger le badge
            </Button>
            <Button variant="outline" asChild className="gap-2">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" /> Accueil
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ThankYou;
