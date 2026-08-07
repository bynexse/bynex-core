import { readJsonObject } from "@/lib/http/validation";
import { personalBinderContext } from "@/lib/personal-binder/context";

export async function POST(request: Request) {
  const context = await personalBinderContext();
  if (!context.ok) return context.response;

  const body = await readJsonObject(request);
  if (body?.action !== "cancel") {
    return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
  }

  const { data, error } = await context.supabase.rpc(
    "cancel_my_digital_binder_subscription",
    { p_subscription_id: context.subscription.id },
  );

  if (error || !data) {
    const safeMessage = [
      "Abonnemanget hittades inte",
      "Abonnemanget kan inte avslutas i nuvarande status",
    ].find((message) => error?.message.includes(message));
    return Response.json(
      { error: safeMessage ?? "Pärmens abonnemang kunde inte avslutas." },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }

  return Response.json({ subscriptionId: data, cancelled: true });
}
