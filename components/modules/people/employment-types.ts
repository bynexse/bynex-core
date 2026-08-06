export type Employment = {
  employment_number: string | null;
  employment_form: "permanent" | "probation" | "special_fixed" | "temporary_substitute" | "seasonal";
  employment_starts_on: string | null;
  employment_ends_on: string | null;
  employment_percentage: number | string;
  weekly_hours: number | string;
  vacation_days_per_year: number | string;
  collective_agreement: string | null;
  role_description: string | null;
  notice_period_days: number | null;
  employment_terms_reference: string | null;
  pay_frequency: "monthly" | "hourly" | "biweekly" | "weekly";
  benefits_summary: string | null;
  overtime_terms_reference: string | null;
  cost_center: string | null;
  workplace: string | null;
  updated_at: string;
};

export type WorkerTaxSettings = {
  tax_form: "A" | "F" | "FA" | "SINK" | "unknown";
  tax_table: number | null;
  tax_column: number | null;
  adjustment_percent: number | string | null;
  main_employer: boolean;
  valid_from: string;
  valid_until: string | null;
  source: string;
  source_checked_at: string | null;
};

export type WorkerLeaveBalance = {
  balance_year: number;
  leave_type: "vacation";
  opening_days: number | string;
  earned_days: number | string;
  used_days: number | string;
  planned_days: number | string;
  remaining_days: number | string;
  calculated_at: string;
  calculation_version: string;
};

export type SensitivePayrollSetup = {
  statusAvailable: boolean;
  personalIdentityConfigured: boolean | null;
  personalIdentityLastFour: string | null;
  personalIdentityCountryCode: string | null;
  paymentAccountConfigured: boolean | null;
  paymentAccountLastFour: string | null;
  paymentAccountCountryCode: string | null;
  paymentAccountBic: string | null;
};

export type EmploymentCapabilities = {
  employmentWritable: boolean;
  taxSettingsWritable: boolean;
  leaveBalanceWritable: boolean;
  secureIdentityWriterAvailable: boolean;
  securePaymentWriterAvailable: boolean;
  sensitiveRevealAvailable: boolean;
};

export type EmploymentData = {
  worker: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    job_title: string | null;
  };
  employment: Employment | null;
  taxSettings: WorkerTaxSettings | null;
  leaveBalance: WorkerLeaveBalance | null;
  sensitiveSetup: SensitivePayrollSetup;
  capabilities: EmploymentCapabilities;
};
