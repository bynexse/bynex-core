import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requireSupabaseUser() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      response: Response.json(
        { error: "Bynex autentisering är inte konfigurerad." },
        { status: 503 },
      ),
    } as const;
  }

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) {
    return {
      response: Response.json({ error: "Inloggning krävs." }, { status: 401 }),
    } as const;
  }

  return { supabase, userId: data.claims.sub } as const;
}
