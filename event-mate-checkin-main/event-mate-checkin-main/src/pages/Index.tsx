import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("slug")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data?.slug) navigate(`/inscription/${data.slug}`, { replace: true });
      else navigate("/login", { replace: true });
    })();
  }, [navigate]);
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      Chargement…
    </div>
  );
};
export default Index;
