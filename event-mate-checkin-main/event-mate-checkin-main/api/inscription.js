export default async function handler(req, res) {
  const { slug } = req.query;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://iqtgnoiuafaopygxwoiy.supabase.co';
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2gzweICEk89Srjd_eE5NJQ_ZKgA5bmb';

  // 1. Fetch the base compiled HTML from the hosting domain
  const host = req.headers.host || 'localhost';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const htmlUrl = `${protocol}://${host}/index.html`;

  let html = '';
  try {
    const htmlRes = await fetch(htmlUrl);
    html = await htmlRes.text();
  } catch (err) {
    console.error('Failed to load base index.html:', err);
    return res.status(500).send('Erreur lors du chargement de la page de base.');
  }

  // If no slug is specified, just return the default HTML
  if (!slug) {
    return res.status(200).send(html);
  }

  try {
    // 2. Fetch the event details from Supabase using REST API (faster & lighter than importing supabase-js client)
    const dbRes = await fetch(`${supabaseUrl}/rest/v1/events?slug=eq.${slug}&select=title,subtitle,description,banner_url,logo_url`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    const events = await dbRes.json();
    
    if (events && events.length > 0) {
      const event = events[0];
      const title = `Inscription - ${event.title}`;
      const description = event.subtitle || event.description || 'Réservez votre place en quelques secondes.';
      const imageUrl = event.banner_url || event.logo_url || 'https://gestion-participants.vercel.app/og-image.png';

      // 3. Inject Open Graph & Twitter metadata dynamically into HTML
      // Replace existing title
      html = html.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);
      
      // Meta tags block
      const metaTags = `
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:image" content="${imageUrl}" />
        <meta name="twitter:title" content="${title}" />
        <meta name="twitter:description" content="${description}" />
        <meta name="twitter:image" content="${imageUrl}" />
        <meta name="twitter:card" content="summary_large_image" />
      `;
      
      // Inject meta tags at the beginning of the <head> element
      html = html.replace('<head>', `<head>${metaTags}`);
    }
  } catch (err) {
    console.error('Error fetching event metadata from Supabase:', err);
  }

  // 4. Return the enriched HTML
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
