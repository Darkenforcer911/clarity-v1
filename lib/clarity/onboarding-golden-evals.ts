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
    readiness?: {
      understanding: "keep_learning" | "sufficient";
      action: "keep_learning" | "sufficient";
    };
    recommendedFirstMove?: string | null;
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
  {
    id: "job-loss-with-multiple-projects",
    fictionalConversation: [
      "I lost my job two months ago and I've got a few other things going on.",
    ],
    expected: {
      responseMode: ["UNDERSTAND", "CLARIFY"],
      recognizes: [
        "job loss is a confirmed current-position fact, not a complete career model",
        "income urgency and runway may change what deserves attention first",
        "the former role, current job search, and active projects remain decision-relevant unknowns",
      ],
      avoids: [
        "jumping immediately to a generic one-year goal question",
        "asking a compound checklist about every unknown",
      ],
      evidencePriority:
        "the next question targets the one unknown most likely to change the immediate priority",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        understanding: "keep_learning",
        action: "keep_learning",
      },
      recommendedFirstMove: null,
    },
  },
  {
    id: "multiple-ambitions-with-immediate-prerequisite",
    fictionalConversation: [
      "I'm weighing up a business, going back to study, and finding another job.",
      "Before any of that, my visa paperwork is due next week and I haven't finished it.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "CHALLENGE"],
      recognizes: [
        "the visa paperwork is the immediate gating problem",
        "choosing a distant route is not the useful decision yet",
        "future ambitions can remain open while the prerequisite is handled",
      ],
      avoids: [
        "forcing a five-year direction choice",
        "building a detailed plan for every possible route",
      ],
      evidencePriority:
        "the dated prerequisite outranks speculative route comparison",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        understanding: "keep_learning",
        action: "sufficient",
      },
      recommendedFirstMove:
        "finish the visa paperwork before comparing the longer-term routes",
    },
  },
  {
    id: "side-income-and-project-evidence",
    fictionalConversation: [
      "I'm applying for jobs, but I also make videos and do occasional design work.",
      "Three businesses have already paid me for design. The videos get some views but haven't earned anything.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "CLARIFY"],
      recognizes: [
        "paid design work is demonstrated capability and income evidence",
        "video interest is real but monetization remains unproven",
        "the repeatability and scale of paid demand could affect the route",
      ],
      avoids: [
        "weighting every interest equally",
        "assuming the side income should immediately replace job seeking",
      ],
      evidencePriority:
        "actual customers outweigh hypothetical project upside",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        understanding: "keep_learning",
        action: "keep_learning",
      },
      recommendedFirstMove: null,
    },
  },
  {
    id: "rich-current-world-first-message",
    fictionalConversation: [
      "I was laid off from a mid-level support role two months ago. I have four months of savings, no dependants, and I'm applying for similar jobs. I've had three interviews but no offers. I also have two paying web clients, though that income only covers about a quarter of my rent. Long term I might build a small agency, but right now I need stable income and I think interview performance is the bottleneck.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "CHALLENGE", "SYNTHESIZE"],
      recognizes: [
        "the current position and economic pressure are already concrete",
        "interview performance is a supported immediate bottleneck hypothesis",
        "the agency remains a possible future route rather than settled direction",
      ],
      avoids: [
        "re-asking the user's role, runway, income, or current objective",
        "delaying useful help merely to collect more biography",
      ],
      evidencePriority:
        "recent interviews and paying clients carry more weight than abstract ambition",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        understanding: "sufficient",
        action: "sufficient",
      },
      recommendedFirstMove:
        "review the recent interviews to identify and practise the repeated failure point",
    },
  },
];
