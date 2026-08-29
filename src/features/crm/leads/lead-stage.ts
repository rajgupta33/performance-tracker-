import type { LeadStage } from './leads.types';

const NEXT_STAGE: Partial<Record<LeadStage, LeadStage>> = {
  NEW: 'CONTACTED',
  CONTACTED: 'INTERESTED',
  INTERESTED: 'NEGOTIATION',
  NEGOTIATION: 'WON',
};

export const nextLeadStage = (stage: LeadStage): LeadStage | null => NEXT_STAGE[stage] || null;

export const leadStageLabel = (stage: LeadStage): string =>
  stage.charAt(0) + stage.slice(1).toLowerCase();

export const canFieldUserMoveLead = (from: LeadStage, to: LeadStage): boolean =>
  from === to || nextLeadStage(from) === to || (['CONTACTED', 'INTERESTED', 'NEGOTIATION'] as LeadStage[]).includes(from) && to === 'LOST';
