import type { CrmLead } from '../leads/leads.types';

export const DEAL_STAGES = ['OPEN', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;
export type DealStage = typeof DEAL_STAGES[number];

export interface CrmDeal {
  id: string;
  organizationId: string;
  leadId: string;
  ownerId: string;
  lead: CrmLead;
  title: string;
  amount: number;
  stage: DealStage;
  expectedCloseDate?: string;
  wonReason?: string;
  lossReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDealInput {
  leadId: string;
  title: string;
  amount: number;
  expectedCloseDate?: string;
}

export interface DealActivity {
  id: number;
  eventType: 'DEAL_CREATED' | 'STAGE_CHANGED' | 'VALUE_CHANGED';
  metadata: Record<string, unknown>;
  createdAt: string;
}
