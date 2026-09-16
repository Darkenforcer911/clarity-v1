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
      person: "keep_learning" | "sufficient";
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
        person: "keep_learning",
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
        person: "keep_learning",
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
        person: "keep_learning",
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
        person: "sufficient",
        action: "sufficient",
      },
      recommendedFirstMove:
        "review the recent interviews to identify and practise the repeated failure point",
    },
  },
  {
    id: "nursing-tests-action-ready-person-not-ready",
    fictionalConversation: [
      "I'm trying to get into nursing. I still need to finish the maths and English entry tests, and I've also been trying to sort out a health routine.",
      "The tests are the thing blocking the application. I could book them this week.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "CLARIFY"],
      recognizes: [
        "the incomplete tests are the immediate supported bottleneck",
        "booking the tests is actionable now",
        "nursing and health do not yet establish the broader person-level picture",
      ],
      avoids: [
        "synthesizing a full Life Map from one narrow thread",
        "treating an actionable prerequisite as person readiness",
      ],
      evidencePriority:
        "the application prerequisite supports a first move while broader commitments and directions remain unexplored",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        person: "keep_learning",
        action: "sufficient",
      },
      recommendedFirstMove: "book the incomplete maths and English tests",
    },
  },
  {
    id: "nursing-breadth-confirmed",
    fictionalConversation: [
      "I'm trying to get into nursing. The maths and English entry tests are blocking my application.",
      "Outside nursing, is anything else seriously competing for your time, money, or direction right now?",
      "No, that's basically everything important right now. I live at home, money is manageable, and my main goal is to qualify and start working in healthcare.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "SYNTHESIZE"],
      recognizes: [
        "the user explicitly bounded the major competing areas",
        "the entry tests remain the immediate bottleneck",
        "qualifying for nursing is a supported route toward healthcare work",
      ],
      avoids: [
        "continuing a category-by-category questionnaire",
        "inventing financial pressure or hidden commitments",
      ],
      evidencePriority:
        "the explicit breadth confirmation and concrete prerequisite support both readiness judgments",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        person: "sufficient",
        action: "sufficient",
      },
      recommendedFirstMove: "book the incomplete entry tests",
    },
  },
  {
    id: "nursing-hidden-work-and-business",
    fictionalConversation: [
      "I'm trying to get into nursing and still need to finish the entry tests.",
      "The tests are important, but I also work four shifts a week and run a small catering business on weekends.",
    ],
    expected: {
      responseMode: ["UNDERSTAND", "CLARIFY", "REFLECT_INSIGHT"],
      recognizes: [
        "work and the business materially change the available time and trade-offs",
        "the newly surfaced branches need contextual follow-up",
        "the tests can remain the bottleneck without completing the person model",
      ],
      avoids: [
        "synthesizing immediately after discovering competing commitments",
        "returning mechanically to the same nursing question",
      ],
      evidencePriority:
        "actual shifts and an active business outweigh assumptions that nursing is the only live concern",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        person: "keep_learning",
        action: "sufficient",
      },
      recommendedFirstMove: "protect time to complete the entry tests",
    },
  },
  {
    id: "unmentioned-competing-directions-stay-unknown",
    fictionalConversation: [
      "I want to apply for nursing and the entry tests are the next step.",
    ],
    expected: {
      responseMode: ["UNDERSTAND", "CLARIFY"],
      recognizes: [
        "nursing is a reported current direction",
        "the entry tests are a candidate next step",
        "other commitments or directions have not come up yet",
      ],
      avoids: [
        "claiming the user has no other commitments",
        "claiming nursing is their settled lifelong destination",
      ],
      evidencePriority:
        "explicitly reported direction is evidence while unmentioned alternatives remain unknown",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        person: "keep_learning",
        action: "sufficient",
      },
      recommendedFirstMove: "complete or book the entry tests",
    },
  },
  {
    id: "minor-routine-stays-out-of-synthesis",
    fictionalConversation: [
      "I'm working toward nursing, money is manageable while I live at home, and the entry tests are the only current blocker. I also use minoxidil every day.",
      "That's basically the full picture right now. I want to qualify, get stable healthcare work, and become more independent.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "SYNTHESIZE"],
      recognizes: [
        "the entry tests are the immediate bottleneck",
        "nursing is a supported current route",
        "independence is the broader future pull",
      ],
      avoids: [
        "promoting minoxidil into the visible synthesis",
        "presenting nursing as proven to be the deepest lifelong destination",
      ],
      evidencePriority:
        "decision-relevant direction, constraints, and prerequisites outweigh a minor daily routine",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        person: "sufficient",
        action: "sufficient",
      },
      recommendedFirstMove: "book the incomplete entry tests",
    },
  },
  {
    id: "job-search-and-app-stage-unknown",
    fictionalConversation: [
      "I lost my L1 role and I'm applying for L2 jobs around $80k plus super. About five interviews have reached serious consideration and I have another tomorrow.",
      "Savings and Centrelink mean I'm not desperate this week. I also resell jewelry, make content for about 4,000 followers, and I'm building an app for that audience.",
      "Apart from the job search, jewelry, content, and the app, is anything else major competing for your time or direction?",
      "I'd say that's pretty much it.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "CLARIFY"],
      recognizes: [
        "tomorrow's interview is the immediate supported priority",
        "the breadth confirmation surfaces the major branches but does not explain app stage",
        "app completion, launch readiness, usage, and blockers could change the route interpretation",
      ],
      avoids: [
        "producing a full First Understanding immediately",
        "claiming unproven demand is the app bottleneck",
      ],
      evidencePriority:
        "the interview evidence supports action readiness while the consequential app-stage unknown blocks person readiness",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        person: "keep_learning",
        action: "sufficient",
      },
      recommendedFirstMove: "prepare for tomorrow's L2 interview",
    },
  },
  {
    id: "app-nearly-ready-for-beta",
    fictionalConversation: [
      "The app is nearly complete. The core flow works, five people from my audience have tested it, and I'm preparing a wider beta next month.",
      "The blocker is finishing onboarding and fixing two reliability issues before I invite more people. There is no revenue evidence yet.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "CLARIFY", "SYNTHESIZE"],
      recognizes: [
        "the product is in pre-beta rather than idea stage",
        "finishing onboarding and reliability work precedes wider validation",
        "early testers are usage evidence but not revenue evidence",
      ],
      avoids: [
        "calling demand the current bottleneck",
        "describing the app as commercially promising",
      ],
      evidencePriority:
        "working product and real testers establish route stage while launch blockers remain more immediate than monetization",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        person: "sufficient",
        action: "sufficient",
      },
      recommendedFirstMove:
        "finish the two launch-blocking reliability fixes before the wider beta",
    },
  },
  {
    id: "breadth-confirmation-does-not-close-route-depth",
    fictionalConversation: [
      "My job search, side sales, content, and the app are basically everything important right now.",
      "The app is connected to my audience, but I haven't said how much is built or whether anyone has used it.",
    ],
    expected: {
      responseMode: ["UNDERSTAND", "CLARIFY"],
      recognizes: [
        "breadth is reasonably bounded",
        "route depth remains incomplete",
        "the app's stage could change the short- and mid-term plan",
      ],
      avoids: [
        "equating that's everything with person readiness",
        "asking another generic breadth question",
      ],
      evidencePriority:
        "a direct app-stage question now reduces more uncertainty than another inventory question",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        person: "keep_learning",
        action: "sufficient",
      },
      recommendedFirstMove: "prepare for the immediate interview",
    },
  },
  {
    id: "minor-unknowns-do-not-block-person-readiness",
    fictionalConversation: [
      "The major picture is the L2 job search plus an app that's in beta. The interview is tomorrow, the app has ten testers, and the current product blocker is reliability before a wider launch.",
      "I don't know which jewelry supplier I'll use next month, but that won't change the job or app plan.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "SYNTHESIZE"],
      recognizes: [
        "the immediate interview priority is clear",
        "the app route has enough stage and blocker evidence to place it",
        "the supplier detail is a non-blocking unknown",
      ],
      avoids: [
        "delaying synthesis for a minor sourcing detail",
        "dropping the uncertainty as though it were answered",
      ],
      evidencePriority:
        "route stage and current blockers matter more than a low-impact future supplier choice",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        person: "sufficient",
        action: "sufficient",
      },
      recommendedFirstMove: "prepare for tomorrow's L2 interview",
    },
  },
  {
    id: "concise-grounded-first-understanding",
    fictionalConversation: [
      "I need stable work, I have an L2 interview tomorrow, and savings reduce the immediate pressure. Jewelry sales are irregular. My content has strong reach, and the app is nearly ready for beta but has no revenue evidence yet.",
      "Longer term I want more control over my time and income, but the exact route is still forming.",
    ],
    expected: {
      responseMode: ["SYNTHESIZE"],
      recognizes: [
        "the interview is the immediate priority",
        "employment provides stability while the app is a higher-upside experiment",
        "the longer-term direction remains explicitly tentative",
      ],
      avoids: [
        "repeating the same priority across multiple synthesis sections",
        "using commercially promising or other inflated business language",
        "promoting minor routine facts",
      ],
      evidencePriority:
        "interview progress, financial runway, audience traction, and actual app stage are the consequential facts",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        person: "sufficient",
        action: "sufficient",
      },
      recommendedFirstMove: "prepare for tomorrow's L2 interview",
    },
  },
];
