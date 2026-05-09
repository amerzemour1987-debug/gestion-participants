
export const sendConfirmationEmail = async ({
  email,
  firstName,
  lastName,
  eventTitle,
  qrCode,
  rooms,
  customTemplate,
}: {
  email: string;
  firstName: string;
  lastName: string;
  eventTitle: string;
  qrCode: string;
  rooms: string[];
  customTemplate?: string | null;
}) => {
  const apiKey = import.meta.env.VITE_BREVO_API_KEY;
  const fromEmail = import.meta.env.VITE_EMAIL_FROM;
  const fromName = import.meta.env.VITE_EMAIL_NAME;

  if (!apiKey) {
    console.error("Brevo API Key missing");
    return { error: "Configuration manquante" };
  }

  const roomListText = rooms.join(", ");
  const roomHtml = rooms.length > 0 ? `<p><strong>Salles/Ateliers :</strong> ${roomListText}</p>` : "";
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrCode}`;

  // Default fallback template if none provided
  let bodyText = customTemplate || `Bonjour {{prenom}},\n\nVotre inscription pour l'événement {{evenement}} a bien été enregistrée.\n\n{{salles}}\n\nVeuillez présenter votre QR code à l'entrée.`;

  // Replacement logic
  const formattedBody = bodyText
    .replace(/{{prenom}}/g, firstName)
    .replace(/{{nom}}/g, lastName)
    .replace(/{{evenement}}/g, eventTitle)
    .replace(/{{salles}}/g, roomHtml)
    .replace(/\n/g, "<br/>");

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #f0f0f0; border-radius: 16px; color: #1a1a1a;">
      <div style="text-align: center; margin-bottom: 25px;">
        <h1 style="color: #2563eb; margin: 0; font-size: 24px;">Confirmation d'inscription</h1>
      </div>
      
      <div style="font-size: 16px; line-height: 1.6; color: #374151;">
        ${formattedBody}
      </div>

      <div style="text-align: center; margin: 35px 0; padding: 25px; background-color: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;">
        <p style="margin-top: 0; margin-bottom: 15px; font-weight: bold; color: #1e293b;">Votre QR Code d'accès :</p>
        <img src="${qrImageUrl}" alt="QR Code" style="width: 200px; height: 200px; border: 8px solid white; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);" />
        <p style="margin-top: 15px; font-size: 11px; color: #64748b; font-family: monospace;">CODE : ${qrCode}</p>
      </div>

      <p style="font-size: 14px; color: #6b7280; text-align: center; font-style: italic;">
        Veuillez présenter ce code à l'entrée (sur smartphone ou papier).
      </p>

      <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 30px 0;" />
      
      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
        Cet email automatique a été envoyé par <strong>${fromName}</strong>.<br/>
        Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.
      </p>
    </div>
  `;

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: email, name: `${firstName} ${lastName}` }],
        subject: `Confirmation d'inscription - ${eventTitle}`,
        htmlContent: htmlContent,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Brevo API error:", errorData);
      return { error: errorData.message || "Erreur lors de l'envoi" };
    }

    return { success: true };
  } catch (error) {
    console.error("Fetch error:", error);
    return { error: "Erreur réseau" };
  }
};
