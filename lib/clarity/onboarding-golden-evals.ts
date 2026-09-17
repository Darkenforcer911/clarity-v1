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
    evidenceRequest?: {
      behavior:
        | "optional_request"
        | "no_request"
        | "verbal_pivot"
        | "incorporate_cautiously";
      target?: string;
    };
    delivery?: {
      preferredShape: "question_only" | "observation_then_question";
      targetMaxVisibleWords: 35;
      reflectionMustAddDecisionValue: true;
    };
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
    id: "employment-target-before-traction",
    fictionalConversation: [
      "I lost my job.",
      "I was an L1 tech admin and I'm applying for jobs.",
    ],
    expected: {
      responseMode: ["UNDERSTAND", "CLARIFY"],
      recognizes: [
        "L1 tech admin is confirmed previous experience rather than a settled current direction",
        "the role or work direction currently being pursued remains a consequential unknown",
        "branch identity must be established before application traction is interpreted",
      ],
      avoids: [
        "inferring that the user is applying for L1, L2, or similar technical roles",
        "asking whether applications produce interviews before learning what roles they target",
      ],
      evidencePriority:
        "ask what kind of roles or direction the user is applying toward before measuring traction",
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
    id: "employment-locate-before-solve",
    fictionalConversation: [
      "I lost my job.",
      "My last role was L1 tech admin.",
      "I'm applying for L2 roles now.",
      "Are those applications actually producing interviews?",
      "I've had five interviews but no offers.",
    ],
    expected: {
      responseMode: ["UNDERSTAND", "CLARIFY", "REFLECT_INSIGHT"],
      recognizes: [
        "the L2 target is established before traction is assessed",
        "application-to-interview traction locates the employment branch before detailed diagnosis",
        "five interviews without an offer makes interview conversion a supported candidate bottleneck",
        "interview feedback or a possible technical gap is now worth investigating while the broader life board remains incomplete",
      ],
      avoids: [
        "asking about technologies, end-to-end ownership, or escalation boundaries before learning whether applications produce interviews",
        "spending several more employment questions on technical detail without checking for another major consequential branch",
      ],
      evidencePriority:
        "pipeline movement separates application positioning from interview conversion before solution-level questioning",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: {
        person: "keep_learning",
        action: "sufficient",
      },
      recommendedFirstMove:
        "review the repeated interview feedback or failure point before prescribing technical remediation",
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
  {
    id: "app-stage-visual-evidence",
    fictionalConversation: [
      "I'm building an app for my audience, but I haven't explained how much of it actually works yet.",
    ],
    expected: {
      responseMode: ["CLARIFY", "UNDERSTAND"],
      recognizes: [
        "product stage is a consequential route-depth unknown",
        "one current product screen may resolve stage faster than several abstract questions",
        "a verbal answer remains sufficient if the user prefers it",
      ],
      avoids: [
        "requiring a screenshot before continuing",
        "asking for both product and analytics evidence at once",
      ],
      evidencePriority:
        "the smallest useful current product view can supplement the app-stage question",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "keep_learning" },
      evidenceRequest: {
        behavior: "optional_request",
        target: "one current app or product screen",
      },
    },
  },
  {
    id: "content-traction-visual-evidence",
    fictionalConversation: [
      "I have about 4,000 followers and a few videos reached millions, but I don't know whether that audience is useful for the thing I'm building.",
    ],
    expected: {
      responseMode: ["CLARIFY", "REFLECT_INSIGHT"],
      recognizes: [
        "reach and useful audience traction are different claims",
        "selected profile or analytics evidence may clarify what is actually working",
        "the evidence request should remain optional and narrow",
      ],
      avoids: [
        "treating follower or view counts as automatic product demand",
        "requesting every analytics screen",
      ],
      evidencePriority:
        "one relevant profile or analytics view may clarify audience fit without proving demand",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "keep_learning" },
      evidenceRequest: {
        behavior: "optional_request",
        target: "one relevant profile or analytics view",
      },
    },
  },
  {
    id: "low-impact-unknown-needs-no-evidence",
    fictionalConversation: [
      "The job interview and app launch plan are clear. I just haven't decided which jewelry supplier I might use next month.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "SYNTHESIZE"],
      recognizes: [
        "the supplier detail is low impact",
        "it does not change the current plan",
        "multimodal availability is not a reason to ask for proof",
      ],
      avoids: [
        "requesting supplier screenshots",
        "delaying readiness for minor evidence",
      ],
      evidencePriority: "no visual evidence is useful for this low-impact unknown",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "sufficient", action: "sufficient" },
      evidenceRequest: { behavior: "no_request" },
    },
  },
  {
    id: "sensitive-evidence-boundary",
    fictionalConversation: [
      "I could send my full bank statement, passport, and login screen if that proves the side business is real.",
    ],
    expected: {
      responseMode: ["CLARIFY", "UNDERSTAND"],
      recognizes: [
        "those documents contain unnecessary sensitive information",
        "the user does not need to prove their identity or reveal credentials",
        "a narrow verbal answer or cropped non-sensitive business view is enough if evidence matters",
      ],
      avoids: [
        "requesting a bank statement or identity document",
        "requesting passwords or authentication codes",
      ],
      evidencePriority:
        "use a verbal question or the smallest cropped non-sensitive surface instead",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "keep_learning" },
      evidenceRequest: { behavior: "no_request" },
    },
  },
  {
    id: "evidence-unavailable-verbal-pivot",
    fictionalConversation: [
      "If you want, send one screenshot of the current app so I can understand its stage.",
      "I don't have a screenshot right now.",
    ],
    expected: {
      responseMode: ["CLARIFY", "UNDERSTAND"],
      recognizes: [
        "the evidence request was declined or unavailable",
        "the app-stage unknown remains open",
        "one concrete verbal question can continue discovery",
      ],
      avoids: [
        "repeating the screenshot request",
        "blocking onboarding until an image is supplied",
      ],
      evidencePriority: "pivot to a verbal app-stage question without penalty",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "keep_learning" },
      evidenceRequest: { behavior: "verbal_pivot" },
    },
  },
  {
    id: "supplied-screenshot-remains-evidence",
    fictionalConversation: [
      "I've attached a screenshot of the beta dashboard. It shows five accounts and a revenue figure, but two of the accounts are mine.",
    ],
    expected: {
      responseMode: ["UNDERSTAND", "REFLECT_INSIGHT", "CLARIFY"],
      recognizes: [
        "the visible dashboard is evidence tied to this user message",
        "five displayed accounts do not necessarily mean five independent users",
        "the revenue figure still needs context before becoming a canonical conclusion",
      ],
      avoids: [
        "treating every visible number as infallible truth",
        "claiming validated demand from the screenshot alone",
      ],
      evidencePriority:
        "use direct visible observations while preserving interpretation and provenance",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "keep_learning" },
      evidenceRequest: { behavior: "incorporate_cautiously" },
    },
  },
  {
    id: "distribution-asset-still-unknown",
    fictionalConversation: [
      "I'm applying for L2 support roles and have an interview tomorrow. Technical depth seems to be where interviews fall down.",
      "I also make content to distribute my Clarity app. The app is in alpha and I want to test it with 30 people from the audience.",
      "I haven't said how large or engaged that audience is, and nobody external has tested the app yet.",
    ],
    expected: {
      responseMode: ["CLARIFY", "REFLECT_INSIGHT"],
      recognizes: [
        "tomorrow's interview is already an actionable priority",
        "the app route depends on audience distribution that is not yet understood",
        "unknown audience scale or engagement could materially change the 30-person test plan",
      ],
      avoids: [
        "setting person readiness from route headlines alone",
        "treating intended external testing as completed traction",
      ],
      evidencePriority:
        "audience scale and engagement are high-impact unknowns while interview evidence still supports action readiness",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "sufficient" },
      recommendedFirstMove: "prepare for tomorrow's L2 interview",
    },
  },
  {
    id: "pre-beta-consistency-contradiction",
    fictionalConversation: [
      "Clarity is an alpha and I plan to put it in front of 30 people, but nobody outside me has tested it yet.",
      "What's still missing before those people can use it?",
      "Nothing really, just staying consistent.",
    ],
    expected: {
      responseMode: ["CLARIFY", "CHALLENGE", "REFLECT_INSIGHT"],
      recognizes: [
        "the stated blocker is too vague to explain why testing has not begun",
        "pre-beta stage and a supposedly ready product may conflict",
        "one concise question should identify what actually prevents the first external test",
      ],
      avoids: [
        "accepting consistency as the proven bottleneck",
        "synthesizing before testing the contradiction",
      ],
      evidencePriority:
        "the stage, claimed blocker, and next milestone must fit before the bottleneck is considered understood",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "sufficient" },
      recommendedFirstMove: "prepare for the immediate interview",
    },
  },
  {
    id: "consequential-audience-evidence-choice",
    fictionalConversation: [
      "The content exists to distribute Clarity to a 30-person alpha, but I haven't explained the audience size, engagement, or growth.",
    ],
    expected: {
      responseMode: ["CLARIFY", "UNDERSTAND"],
      recognizes: [
        "audience traction is the current decision-relevant unknown",
        "a verbal answer may be enough",
        "one profile or analytics screenshot may efficiently clarify the same question",
      ],
      avoids: [
        "requesting both analytics and a Clarity product screenshot",
        "requesting visual evidence only because uploads are available",
      ],
      evidencePriority:
        "ask about audience scale and engagement verbally or offer one optional profile or analytics screenshot",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "sufficient" },
      evidenceRequest: {
        behavior: "optional_request",
        target: "one content profile or analytics screenshot",
      },
    },
  },
  {
    id: "consequential-routes-bounded-and-ready",
    fictionalConversation: [
      "Tomorrow's L2 interview is the immediate priority and technical depth is the interview gap.",
      "Clarity's alpha flow is ready for outside use. My audience is about 4,000, engagement is strongest on the videos about this problem, and I have 30 people identified for the first test.",
      "No external test has happened yet, so I don't know retention or willingness to pay. Those can only be learned from the test and don't change the first plan.",
      "Long term is still forming. Right now I want stable income while testing whether Clarity deserves to become the bigger route.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "SYNTHESIZE"],
      recognizes: [
        "the employment and Clarity routes are understood well enough to place",
        "post-test retention and willingness to pay are explicitly bounded unknowns",
        "a still-forming long-term destination does not block a useful current plan",
      ],
      avoids: [
        "repeating audience and alpha facts across synthesis sections",
        "forcing a fixed five-year destination",
      ],
      evidencePriority:
        "current audience scale, product readiness, identified testers, and explicit unknown boundaries support person readiness",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "sufficient", action: "sufficient" },
      recommendedFirstMove: "prepare for tomorrow's L2 interview",
      evidenceRequest: { behavior: "no_request" },
    },
  },
  {
    id: "caregiver-returning-to-work",
    fictionalConversation: [
      "I've been home with my children for three years and want to return to paid work, but I don't know what shape would fit around school hours.",
      "I used to manage a retail team. I need some income, but being available after school matters more than returning full-time immediately.",
    ],
    expected: {
      responseMode: ["UNDERSTAND", "CLARIFY", "REFLECT_INSIGHT"],
      recognizes: [
        "returning to paid work is an active branch whose desired shape is not yet settled",
        "prior management experience is capability evidence rather than proof of the current target",
        "care availability and income pressure are cross-cutting constraints that affect viable routes",
      ],
      avoids: [
        "assuming the user wants the same role or full-time hours",
        "turning childcare and finances into a mandatory checklist",
      ],
      evidencePriority:
        "locate the desired work shape and material constraints before diagnosing employability or prescribing applications",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "keep_learning" },
      recommendedFirstMove: null,
    },
  },
  {
    id: "student-degree-continuation",
    fictionalConversation: [
      "I'm halfway through a degree and thinking about leaving, but I don't know whether I dislike the subject or just the way life feels this semester.",
      "My grades are fine. The course leads to work I might enjoy, but I'm exhausted and also curious about a different field.",
    ],
    expected: {
      responseMode: ["UNDERSTAND", "CLARIFY", "REFLECT_INSIGHT"],
      recognizes: [
        "degree performance, current exhaustion, and desired work are distinct dimensions",
        "adequate grades are evidence that capability is not yet the established blocker",
        "the alternative field is a possible route whose identity and evidence remain thin",
      ],
      avoids: [
        "telling the user to quit or persist before separating temporary pressure from direction",
        "treating curiosity about another field as demonstrated fit",
      ],
      evidencePriority:
        "compare what the degree is meant to enable with the source and duration of current pressure before choosing a route",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "keep_learning" },
      recommendedFirstMove: null,
    },
  },
  {
    id: "salaried-relocation-decision",
    fictionalConversation: [
      "I have a stable salaried job and I'm considering moving interstate with my partner later this year.",
      "My role might become remote, but that hasn't been approved. My partner already has an offer there and needs to decide soon.",
    ],
    expected: {
      responseMode: ["CLARIFY", "REFLECT_INSIGHT", "CHALLENGE"],
      recognizes: [
        "relocation, employment continuity, and the partner's decision are connected branches",
        "remote approval is an unresolved dependency rather than an established option",
        "the partner's deadline creates real pressure on the comparison",
      ],
      avoids: [
        "reducing the decision to career preference alone",
        "assuming remote work or recommending relocation before the dependency is bounded",
      ],
      evidencePriority:
        "the remote-work decision and partner deadline most affect which relocation options are real",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "keep_learning" },
      recommendedFirstMove: null,
    },
  },
  {
    id: "debt-and-side-business",
    fictionalConversation: [
      "My salary covers the basics, but I have debt repayments and a small weekend repair business that I hope could grow.",
      "The business has eight paying customers, though the work is inconsistent and I haven't tracked profit properly.",
    ],
    expected: {
      responseMode: ["CLARIFY", "REFLECT_INSIGHT", "CHALLENGE"],
      recognizes: [
        "salary stability and debt pressure affect how much risk the business route can carry",
        "paying customers are real evidence while profitability and repeatability remain unknown",
        "the side business may be upside without yet being a replacement-income route",
      ],
      avoids: [
        "telling the user to leave the salary because customers exist",
        "asking for a complete debt and household-finance inventory by default",
      ],
      evidencePriority:
        "actual profit and repeat demand would most change how the business should be placed beside salary and obligations",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "keep_learning" },
      recommendedFirstMove: null,
    },
  },
  {
    id: "health-pressure-before-career",
    fictionalConversation: [
      "I keep trying to make a career plan, but a health issue has been making it hard to work a normal week.",
      "I'm seeing a clinician and still waiting to understand what is going on. For now I can only manage a few focused hours most days.",
    ],
    expected: {
      responseMode: ["UNDERSTAND", "CLARIFY", "REFLECT_INSIGHT"],
      recognizes: [
        "current functioning is a cross-cutting constraint on career options and pace",
        "appropriate professional support is already in progress while the outcome remains uncertain",
        "the immediate priority may be a sustainable near-term operating shape rather than a definitive career choice",
      ],
      avoids: [
        "diagnosing the health issue or overriding the clinician",
        "forcing a detailed career route before the capacity constraint is bounded",
      ],
      evidencePriority:
        "current usable capacity and near-term health uncertainty matter more than speculative long-term optimization",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "keep_learning" },
      recommendedFirstMove: null,
    },
  },
  {
    id: "verbal-economy-current-work",
    fictionalConversation: [
      "I make decent money right now, but I feel like I'm working all the time and I don't know what direction to focus on.",
    ],
    expected: {
      responseMode: ["UNDERSTAND", "CLARIFY"],
      recognizes: [
        "current work identity is still unknown",
        "time pressure is reported but not yet located precisely",
        "direction should not be diagnosed before the current branch is located",
      ],
      avoids: [
        "restating that income comes at the cost of time",
        "adding polished narration before a simple branch-location question",
      ],
      evidencePriority:
        "a direct question about the current work should locate the branch before asking for detailed hours or solutions",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "keep_learning" },
      recommendedFirstMove: null,
      delivery: {
        preferredShape: "question_only",
        targetMaxVisibleWords: 35,
        reflectionMustAddDecisionValue: true,
      },
    },
  },
  {
    id: "verbal-economy-useful-reflection",
    fictionalConversation: [
      "I'm applying for L2 support roles.",
      "I've had five interviews and no offers.",
    ],
    expected: {
      responseMode: ["REFLECT_INSIGHT", "CLARIFY"],
      recognizes: [
        "applications are producing interviews",
        "initial consideration is therefore not the immediate failure point",
        "feedback or interview conversion is the next useful unknown",
      ],
      avoids: [
        "repeating the interview count without drawing a useful inference",
        "explaining the whole employment funnel before asking for feedback",
      ],
      evidencePriority:
        "one short conversion insight may earn its place before a direct feedback question",
      asksAtMostOneQuestion: true,
      preservesUncertainty: true,
      readiness: { person: "keep_learning", action: "keep_learning" },
      recommendedFirstMove: null,
      delivery: {
        preferredShape: "observation_then_question",
        targetMaxVisibleWords: 35,
        reflectionMustAddDecisionValue: true,
      },
    },
  },
];
