import type { DealStage } from './deals.types';

const nextStages: Partial<Record<DealStage, DealStage>> = {
  OPEN: 'PROPOSAL',
  PROPOSAL: 'NEGOTIATION',
  NEGOTIATION: 'WON',
};

export const nextDealStage = (stage: DealStage) => nextStages[stage];
export const dealStageLabel = (stage: DealStage) => stage.charAt(0) + stage.slice(1).toLowerCase();
