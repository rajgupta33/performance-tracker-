import type { CustomerSummary } from '../../visits/visits.types';

export const LEAD_STAGES = ['NEW', 'CONTACTED', 'INTERESTED', 'NEGOTIATION', 'WON', 'LOST'] as const;
export type LeadStage = typeof LEAD_STAGES[number];
export type LeadSource = 'FIELD' | 'VISIT' | 'REFERRAL' | 'INBOUND' | 'OTHER';
export type FollowUpType = 'CALL' | 'VISIT' | 'EMAIL' | 'MESSAGE' | 'OTHER';

export interface CrmLead {
  id: string;
  organizationId: string;
  ownerId: string;
  customerId?: string;
  customer?: CustomerSummary;
  prospectName?: string;
  contactName?: string;
  mobile?: string;
  source: LeadSource;
  stage: LeadStage;
  estimatedValue?: number;
  products: string[];
  nextFollowUpAt?: string;
  lossReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeadInput {
  customerId?: string;
  prospectName?: string;
  contactName?: string;
  mobile?: string;
  source: LeadSource;
  estimatedValue?: number;
  products: string[];
  followUpAt: string;
  followUpType: FollowUpType;
  followUpNote?: string;
}
