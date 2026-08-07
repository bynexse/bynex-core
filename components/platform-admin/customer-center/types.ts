export type AssistanceSummary = {
  workers?: Array<{ id: string; active: boolean }>;
  app_members?: Array<{ user_id: string; active: boolean }>;
  pending_invites?: Array<{ id: string }>;
  subscription?: {
    seat_count?: number | string;
    included_users?: number | string;
    plan_name?: string;
  };
};

export type CustomerCenterActionRunner = (
  action: string,
  payload: Record<string, unknown>,
  successMessage: string,
) => Promise<boolean>;
