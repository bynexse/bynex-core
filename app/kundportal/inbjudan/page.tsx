import InviteAcceptance from "./InviteAcceptance";

export default async function CustomerPortalInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <InviteAcceptance initialToken={typeof token === "string" ? token.toLowerCase() : ""} />;
}
