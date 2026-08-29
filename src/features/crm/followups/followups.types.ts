import type { FollowUpType, LeadStage } from '../leads/leads.types';

export type FollowUpStatus = 'OPEN' | 'DONE' | 'CANCELLED';
export type FollowUpBucket = 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'DONE';

export interface CrmFollowUp {
  id: string;
  organizationId: string;
  leadId: string;
  ownerId: string;
  type: FollowUpType;
  note?: string;
  dueAt: string;
  status: FollowUpStatus;
  completedAt?: string;
  completionNote?: string;
  lead: {
    id: string;
    stage: LeadStage;
    prospectName?: string;
    contactName?: string;
    mobile?: string;
    customer?: { id: string; name: string };
  };
}

export interface CompleteFollowUpInput {
  completionNote: string;
  nextDueAt?: string;
  nextType: FollowUpType;
  nextNote?: string;
}
