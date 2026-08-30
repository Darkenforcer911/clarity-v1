export type ClarityQualitativeConfidence = "low" | "moderate" | "high";
export type ClarityQualitativeRating =
  | "low"
  | "moderate"
  | "high"
  | "unknown";

export type ClarityOpportunityCandidate = {
  id: string;
  title: string;
  description: string;
  createsOptionsBy: string;
};

export type ClarityOpportunityDimension = {
  rating: ClarityQualitativeRating;
  rationale: string;
};

export type ClarityOpportunityEvaluation = {
  opportunity: ClarityOpportunityCandidate;
  upside: ClarityOpportunityDimension;
  evidence: ClarityOpportunityDimension;
  downsideRisk: ClarityOpportunityDimension;
  reversibility: ClarityOpportunityDimension;
  cost: ClarityOpportunityDimension;
  timeToEvidence: ClarityOpportunityDimension;
  desiredLifeFit: ClarityOpportunityDimension;
  optionValue: ClarityOpportunityDimension;
  constraints: string[];
  confidence: ClarityQualitativeConfidence;
  missingEvidence: string[];
};

export type ClarityScenario = {
  summary: string;
  implications: string[];
};

export type ClarityScenarioForecast = {
  likelyCase: ClarityScenario;
  upsideCase: ClarityScenario;
  downsideCase: ClarityScenario;
  confidence: ClarityQualitativeConfidence;
  keyAssumptions: string[];
  evidenceThatWouldChangeForecast: string[];
};

export interface ClarityOpportunityCapability {
  evaluate(input: {
    candidate: ClarityOpportunityCandidate;
    contextSummary: string;
  }): Promise<ClarityOpportunityEvaluation>;
}

export interface ClarityScenarioCapability {
  forecast(input: {
    decision: string;
    contextSummary: string;
  }): Promise<ClarityScenarioForecast>;
}
