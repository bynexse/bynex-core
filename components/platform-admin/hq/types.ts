import type { SmartPricePlan } from "@/lib/platform/smart-price";

// Shared HQ transport types. Kept centralized so Vercel and local builds validate the same data shape.
export type JsonRecord = Record<string, any>;

export type OrganizationRow = {
  id: string;
  name: string;
  organization_number: string | null;
  business_form: string;
  status: string;
  created_at: string;
  lifecycle_stage: string | null;
  account_status: string | null;
  health_score: number | null;
  next_action_at: string | null;
  tags: string[] | null;
  subscription_id: string | null;
  subscription_status: string | null;
  seat_count: number | null;
  trial_ends_at: string | null;
  plan_id: string | null;
  plan_name: string | null;
  customer_number: string | null;
  billing_email: string | null;
  auto_invoice_enabled: boolean | null;
  member_count: number;
  outstanding_inc_vat: number | string;
  last_invoice_date: string | null;
};

export type Plan = SmartPricePlan & {
  slug: string;
  tagline?: string;
  description?: string;
  trial_days: number;
  highlighted: boolean;
  active: boolean;
  sort_order: number;
};

export type ProductModule = {
  slug: string;
  name: string;
  description: string;
  product_area: string;
  standalone_available: boolean;
  beta_available: boolean;
  active: boolean;
  sort_order: number;
};

export type SelectedCustomer = {
  organization: JsonRecord | null;
  crm: JsonRecord | null;
  billing_profile: JsonRecord | null;
  subscription: JsonRecord | null;
  contacts: JsonRecord[];
  activities: JsonRecord[];
  proposals: JsonRecord[];
  contracts: JsonRecord[];
  agreements: JsonRecord[];
  invoices: JsonRecord[];
  support_cases: JsonRecord[];
};

export type HqData = {
  role: string;
  summary: {
    customers: number;
    leads: number;
    enterprise_proposals: number;
    active_contracts: number;
    open_tasks: number;
    active_subscriptions?: number;
    trials?: number;
    past_due_subscriptions?: number;
    monthly_recurring_revenue_ex_vat?: number | string;
    outstanding_inc_vat?: number | string;
    upcoming_invoice_value_ex_vat?: number | string;
    open_support_cases?: number;
  };
  organizations: OrganizationRow[];
  selected: SelectedCustomer | null;
  catalog: {
    plans: Plan[];
    modules: ProductModule[];
    terms: Array<{
      term_months: number;
      discount_percent: number | string;
      label: string;
    }>;
  };
  billing: {
    discounts: JsonRecord[];
    manual_charges: JsonRecord[];
    payments: JsonRecord[];
    credit_notes: JsonRecord[];
    delivery_jobs: JsonRecord[];
    organization_balances: JsonRecord[];
  };
  management: {
    staff: JsonRecord[];
    candidate_users: JsonRecord[];
    approvals: JsonRecord[];
  };
  supportMessages: JsonRecord[];
  recent_audit: JsonRecord[];
};

export type HqTab =
  | "overview"
  | "customers"
  | "customer"
  | "pricing"
  | "contracts"
  | "billing"
  | "support"
  | "catalog"
  | "staff"
  | "audit";
