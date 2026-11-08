import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const { data: auth } = await supabase.auth.getUser();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, activo, org_id, organizations(name, country, currency_default)")
      .eq("id", auth.user!.id)
      .single();
    if (error) throw error;
    return { email: auth.user!.email, ...profile };
  },
});
