
export const sendConfirmationEmail = async ({
  email,
  firstName,
  lastName,
  eventTitle,
  qrCode,
  rooms,
}: {
  email: string;
  firstName: string;
  lastName: string;
  eventTitle: string;
  qrCode: string;
  rooms: string[];
}) => {
  const apiKey = import.meta.env.VITE_BREVO_API_KEY;
  const fromEmail = import.meta.env.VITE_EMAIL_FROM;
  const fromName = import.meta.env.VITE_EMAIL_NAME;

  if (!apiKey) {
    console.error("Brevo API Key missing");
    return { error: "Configuration manquante" };
  }

  const roomText = rooms.length > 0 ? `<p><strong>Salles/Ateliers :</strong> ${rooms.join(", ")}</p>` : "";

  // Generate a data URL for the QR code image using a public CDN or just text
  // For Brevo, we can use an <img> tag with a QR code generator service
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrCode}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <h1 style="color: #3b82f6; text-align: center;">Confirmation d'inscription</h1>
      <p>Bonjour <strong>${firstName} ${lastName}</strong>,</p>
      <p>Votre inscription pour l'événement <strong>${eventTitle}</strong> a bien été enregistrée.</p>
      ${roomText}
      <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
        <p style="margin-bottom: 15px; font-weight: bold;">Votre QR Code d'accès :</p>
        <img src="${qrImageUrl}" alt="QR Code" style="width: 200px; height: 200px; border: 10px solid white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);" />
        <p style="margin-top: 10px; font-size: 12px; color: #64748b;">Code : ${qrCode}</p>
      </div>
      <p>Veuillez présenter ce QR code (sur votre téléphone ou imprimé) à l'entrée de l'événement.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #94a3b8; text-align: center;">
        Cet email a été envoyé par ${fromName}.<br/>
        Si vous n'êtes pas à l'origine de cette inscription, veuillez ignorer ce message.
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
