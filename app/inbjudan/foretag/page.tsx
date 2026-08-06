import OrganizationInviteAcceptance from "./OrganizationInviteAcceptance";

export default async function OrganizationInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <OrganizationInviteAcceptance
      token={typeof token === "string" ? token.trim() : ""}
    />
  );
}
