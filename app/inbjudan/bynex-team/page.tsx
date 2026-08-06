import BynexTeamInviteAcceptance from "./BynexTeamInviteAcceptance";

export default async function BynexTeamInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <BynexTeamInviteAcceptance
      token={typeof token === "string" ? token.trim() : ""}
    />
  );
}
