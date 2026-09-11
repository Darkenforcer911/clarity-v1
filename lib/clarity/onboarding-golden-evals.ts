export type OnboardingGoldenEval = {
  id: string;
  fictionalConversation: string[];
  expected: {
    responseMode: Array<
      | "UNDERSTAND"
      | "CLARIFY"
      | "REFLECT_INSIGHT"
      | "CHALLENGE"
      | "EXPAND_POSSIBILITIES"
      | "SYNTHESIZE"
    >;
    recognizes: string[];
    avoids: string[];
    evidencePriority: string;
    asksAtMostOneQuestion: true;
    preservesUncertainty: true;
  };
};

/** Fictional, anonymized cases for model evaluation; never production prompt data. */
export const onboardingGoldenEvals: OnboardingGoldenEval[] = [
  {
    id: "fragmented-founder",
    fictionalConversation: [
      "I’m building a small software company, consulting for runway, and considering two other projects. I want financial independence but everything feels important.",
      "Consulting pays the bills for six months. The startup has early users, while the other ideas are still just ideas.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "CHALLENGE", "CLARIFY"],
      recognizes: [
        "runway and upside are different concerns",
        "paid work is a route rather than the destination",
        "fragmentation is the likely near-term risk",
      ],
      avoids: ["telling the user to pursue every project", "treating ambition as evidence"],
      evidencePriority: "early users and current runway outweigh untested ideas",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
    },
  },
  {
    id: "directionless-young-adult",
    fictionalConversation: [
      "I’m 21, working casually, and don’t know what career I want. I mostly know I want good money, freedom, and room to travel.",
      "I’ve done retail and made a few videos people liked, but I don’t really know what options exist beyond the obvious jobs.",
    ],
    expected: {
      responseMode: ["EXPAND_POSSIBILITIES", "CLARIFY"],
      recognizes: [
        "the possibility map is incomplete",
        "a permanent career choice would be premature",
        "short-term stability can coexist with route exploration",
      ],
      avoids: ["forcing one career", "returning a giant career list"],
      evidencePriority: "real work and audience response are evidence, not destiny",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
    },
  },
  {
    id: "time-fragmented-skilled-worker",
    fictionalConversation: [
      "My job pays decently but the shifts break up the whole week. I want more control of my time.",
      "I do photography on the side and five people have already paid me. Crypto also looks tempting, but I’ve never made money from it.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "CHALLENGE", "CLARIFY"],
      recognizes: [
        "schedule fragmentation is a real constraint",
        "paid photography is demonstrated evidence",
        "the current income floor should be protected",
      ],
      avoids: ["equating speculative upside with paid demand", "telling the user to quit immediately"],
      evidencePriority: "paying customers outweigh theoretical speculative returns",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
    },
  },
];
