export type CompanyModule = {
  slug: string;
  name: string;
  description: string;
  source: string;
  endsAt: string | null;
};

export type CompanyContext = {
  organizationId: string;
  name: string;
  organizationNumber: string;
  businessForm: string;
  timezone: string;
  defaultLanguage: string;
  role: string;
  userFullName: string;
  planName: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  modules: CompanyModule[];
};
