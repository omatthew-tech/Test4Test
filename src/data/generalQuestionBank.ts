export interface GeneralQuestionTemplate {
  id: string;
  prompt: string;
  options: readonly string[];
}

export interface GeneralParagraphQuestionTemplate {
  id: string;
  prompt: string;
}

const VERY_UNLIKELY_SCALE = [
  "Very unlikely",
  "Unlikely",
  "Neither likely nor unlikely",
  "Likely",
  "Very likely",
] as const;

const EXTENT_SCALE = ["Not at all", "Slightly", "Moderately", "Very", "Extremely"] as const;

const EASY_SCALE = [
  "Very difficult",
  "Difficult",
  "Neither easy nor difficult",
  "Easy",
  "Very easy",
] as const;

const SUPPORT_SCALE = [
  "None at all",
  "A little",
  "A moderate amount",
  "A lot",
  "A great deal",
] as const;

const INTEGRATED_SCALE = [
  "Not at all integrated",
  "Slightly integrated",
  "Moderately integrated",
  "Very integrated",
  "Completely integrated",
] as const;

const SPEED_SCALE = [
  "Very slowly",
  "Slowly",
  "Neither slowly nor quickly",
  "Quickly",
  "Very quickly",
] as const;

const CUMBERSOME_SCALE = [
  "Not at all cumbersome",
  "Slightly cumbersome",
  "Moderately cumbersome",
  "Very cumbersome",
  "Extremely cumbersome",
] as const;

const CONFIDENT_SCALE = [
  "Not at all confident",
  "Slightly confident",
  "Moderately confident",
  "Very confident",
  "Extremely confident",
] as const;

const WELL_SCALE = [
  "Not at all well",
  "Slightly well",
  "Moderately well",
  "Very well",
  "Extremely well",
] as const;

const SATISFIED_SCALE = [
  "Very dissatisfied",
  "Dissatisfied",
  "Neither satisfied nor dissatisfied",
  "Satisfied",
  "Very satisfied",
] as const;

const EFFECTIVELY_SCALE = [
  "Not at all effectively",
  "Slightly effectively",
  "Moderately effectively",
  "Very effectively",
  "Extremely effectively",
] as const;

const COMFORTABLE_SCALE = [
  "Very uncomfortable",
  "Uncomfortable",
  "Neither comfortable nor uncomfortable",
  "Comfortable",
  "Very comfortable",
] as const;

const CLEARLY_SCALE = [
  "Not at all clearly",
  "Slightly clearly",
  "Moderately clearly",
  "Very clearly",
  "Extremely clearly",
] as const;

const EASILY_SCALE = [
  "Not at all easily",
  "Slightly easily",
  "Moderately easily",
  "Very easily",
  "Extremely easily",
] as const;

const CLEAR_SCALE = [
  "Very unclear",
  "Unclear",
  "Neither clear nor unclear",
  "Clear",
  "Very clear",
] as const;

const EFFECTIVE_SCALE = [
  "Not at all effective",
  "Slightly effective",
  "Moderately effective",
  "Very effective",
  "Extremely effective",
] as const;

const ATTRACTIVE_SCALE = [
  "Not at all attractive",
  "Slightly attractive",
  "Moderately attractive",
  "Very attractive",
  "Extremely attractive",
] as const;

const VERY_MUCH_SCALE = ["Not at all", "Slightly", "Moderately", "Very much", "Extremely"] as const;

const CREDIBLE_SCALE = [
  "Not at all credible",
  "Slightly credible",
  "Moderately credible",
  "Very credible",
  "Extremely credible",
] as const;

const TRUSTWORTHY_SCALE = [
  "Not at all trustworthy",
  "Slightly trustworthy",
  "Moderately trustworthy",
  "Very trustworthy",
  "Extremely trustworthy",
] as const;

const RECOMMEND_SCALE = [
  "Very unlikely",
  "Unlikely",
  "Neither likely nor unlikely",
  "Likely",
  "Very likely",
] as const;

const LOW_HIGH_SCALE = [
  "Very low",
  "Low",
  "Moderate",
  "High",
  "Very high",
] as const;

const PRESSURE_SCALE = [
  "Not at all",
  "Slightly",
  "Moderately",
  "Very",
  "Extremely",
] as const;

const SUCCESS_SCALE = [
  "Not at all successful",
  "Slightly successful",
  "Moderately successful",
  "Very successful",
  "Completely successful",
] as const;

const TRUST_SCALE = ["Not at all", "Slightly", "Moderately", "Very much", "Completely"] as const;

const SAFE_SCALE = [
  "Not at all safe",
  "Slightly safe",
  "Moderately safe",
  "Very safe",
  "Extremely safe",
] as const;

const VALUE_SCALE = ["Very poor", "Poor", "Fair", "Good", "Excellent"] as const;
const VALUE_FOR_EFFORT_SCALE = ["Very poor value", "Poor value", "Fair value", "Good value", "Excellent value"] as const;
const EXPECTATION_SCALE = [
  "Much worse than expected",
  "Worse than expected",
  "About as expected",
  "Better than expected",
  "Much better than expected",
] as const;
const IDEAL_SCALE = [
  "Not at all close",
  "Slightly close",
  "Moderately close",
  "Very close",
  "Extremely close",
] as const;
const PROFESSIONAL_SCALE = [
  "Not at all professional",
  "Slightly professional",
  "Moderately professional",
  "Very professional",
  "Extremely professional",
] as const;
const COMPETENT_SCALE = [
  "Not at all competent",
  "Slightly competent",
  "Moderately competent",
  "Very competent",
  "Extremely competent",
] as const;
const RELIABLY_SCALE = [
  "Not at all reliably",
  "Slightly reliably",
  "Moderately reliably",
  "Very reliably",
  "Extremely reliably",
] as const;
const TRANSPARENT_SCALE = [
  "Not at all transparent",
  "Slightly transparent",
  "Moderately transparent",
  "Very transparent",
  "Extremely transparent",
] as const;
const PREDICTABLY_SCALE = [
  "Not at all predictably",
  "Slightly predictably",
  "Moderately predictably",
  "Very predictably",
  "Extremely predictably",
] as const;
const WILLING_SCALE = [
  "Very unwilling",
  "Unwilling",
  "Neither willing nor unwilling",
  "Willing",
  "Very willing",
] as const;
const NEUTRAL_SUPPORTIVE_SCALE = [
  "Obstructive",
  "Somewhat obstructive",
  "Neutral",
  "Somewhat supportive",
  "Supportive",
] as const;
const NEUTRAL_EASY_SCALE = [
  "Complicated",
  "Somewhat complicated",
  "Neutral",
  "Somewhat easy",
  "Easy",
] as const;
const NEUTRAL_EFFICIENT_SCALE = [
  "Inefficient",
  "Somewhat inefficient",
  "Neutral",
  "Somewhat efficient",
  "Efficient",
] as const;
const NEUTRAL_CLEAR_SCALE = [
  "Confusing",
  "Somewhat confusing",
  "Neutral",
  "Somewhat clear",
  "Clear",
] as const;
const NEUTRAL_EXCITING_SCALE = [
  "Boring",
  "Somewhat boring",
  "Neutral",
  "Somewhat exciting",
  "Exciting",
] as const;
const NEUTRAL_INTERESTING_SCALE = [
  "Uninteresting",
  "Somewhat uninteresting",
  "Neutral",
  "Somewhat interesting",
  "Interesting",
] as const;
const NEUTRAL_INVENTIVE_SCALE = [
  "Conventional",
  "Somewhat conventional",
  "Neutral",
  "Somewhat inventive",
  "Inventive",
] as const;
const NEUTRAL_LEADING_EDGE_SCALE = [
  "Usual",
  "Somewhat usual",
  "Neutral",
  "Somewhat leading-edge",
  "Leading-edge",
] as const;
const NEUTRAL_TECHNICAL_SCALE = [
  "Human",
  "Somewhat human",
  "Neutral",
  "Somewhat technical",
  "Technical",
] as const;
const NEUTRAL_CONNECTIVE_SCALE = [
  "Isolating",
  "Somewhat isolating",
  "Neutral",
  "Somewhat connective",
  "Connective",
] as const;
const NEUTRAL_PLEASANT_SCALE = [
  "Unpleasant",
  "Somewhat unpleasant",
  "Neutral",
  "Somewhat pleasant",
  "Pleasant",
] as const;
const NEUTRAL_SIMPLE_SCALE = [
  "Complicated",
  "Somewhat complicated",
  "Neutral",
  "Somewhat simple",
  "Simple",
] as const;
const NEUTRAL_PROFESSIONAL_SCALE = [
  "Unprofessional",
  "Somewhat unprofessional",
  "Neutral",
  "Somewhat professional",
  "Professional",
] as const;
const NEUTRAL_ATTRACTIVE_SCALE = [
  "Unattractive",
  "Somewhat unattractive",
  "Neutral",
  "Somewhat attractive",
  "Attractive",
] as const;
const NEUTRAL_PRACTICAL_SCALE = [
  "Impractical",
  "Somewhat impractical",
  "Neutral",
  "Somewhat practical",
  "Practical",
] as const;
const NEUTRAL_LIKEABLE_SCALE = [
  "Disagreeable",
  "Somewhat disagreeable",
  "Neutral",
  "Somewhat likeable",
  "Likeable",
] as const;
const NEUTRAL_STRAIGHTFORWARD_SCALE = [
  "Cumbersome",
  "Somewhat cumbersome",
  "Neutral",
  "Somewhat straightforward",
  "Straightforward",
] as const;

const GENERAL_PARAGRAPH_QUESTION_PROMPTS = `
1. What was your first impression of this product?
2. What do you think this product is mainly for?
3. What kinds of things do you think you can do here?
4. How do you think someone like you would use this product?
5. What would you do next if you were using this on your own?
6. What part of the page or screen drew your attention first, and why?
7. What, if anything, felt unclear the first time you looked at this?
8. What words, labels, or messages stood out to you right away?
9. What were you expecting to find when you opened this?
10. What did this product seem to expect you to do first?
11. What about the design or layout shaped your first impression?
12. What about the content or language shaped your first impression?
13. What seemed most useful at first glance?
14. What seemed least useful at first glance?
15. What made you feel that this product was or was not relevant to you?
16. Where would you go to complete the task you had in mind?
17. How did you decide where to go first?
18. What made you choose that option instead of another one?
19. What did you expect to find when you selected that label, menu, or link?
20. What did you expect that label, menu, or heading to mean?
21. What would you expect to find under that section or category?
22. What label or wording would make this easier to understand?
23. Which labels or categories felt too vague, and why?
24. Which labels or categories felt clear, and why?
25. What parts of the navigation felt intuitive to you?
26. What parts of the navigation felt hard to predict?
27. How did you try to find information when you were not sure where to go?
28. What, if anything, made browsing easier than searching here?
29. What, if anything, made searching easier than browsing here?
30. What would make it easier to know where you are and where to go next?
31. How did that task go for you?
32. What part of the task felt easiest?
33. What part of the task felt hardest?
34. What, if anything, was confusing during the task?
35. What, if anything, was frustrating during the task?
36. At what point did you feel unsure about what to do next?
37. What were you expecting to happen at that moment?
38. What happened instead of what you expected?
39. What slowed you down, if anything?
40. What helped you keep moving through the task?
41. What did you try when your first approach did not work?
42. What made a step feel harder or easier than you expected?
43. What made this task feel more complicated or simpler than it needed to be?
44. What part of the process felt smooth or natural?
45. What part of the process felt awkward or unnecessary?
46. What did the information on this page or screen mean to you?
47. What words or phrases were easiest to understand?
48. What words or phrases were hardest to understand?
49. What messages or instructions felt helpful?
50. What messages or instructions felt unhelpful?
51. What information felt clear and complete?
52. What information felt incomplete or missing context?
53. What information felt too technical, too vague, or too dense?
54. What information helped you decide what to do next?
55. What information did you ignore, and why?
56. What information felt most useful to you?
57. What information felt least useful to you?
58. What would make this page or screen more useful?
59. How could the wording be improved to make this easier to use?
60. What would you rewrite, shorten, or explain differently?
61. What is your impression of the look and feel of this product?
62. What do you think about the overall design and layout?
63. What do you think about how the content is presented visually?
64. What did you notice about the balance between text and visual elements?
65. What visual elements helped you understand what to do?
66. What visual elements distracted or confused you?
67. What did you think about the images, illustrations, icons, or media here?
68. What made this feel clean or cluttered to you?
69. What made this feel professional or unprofessional to you?
70. What made this feel modern, dated, serious, friendly, or something else?
71. What would you change about the visual presentation first?
72. What should stay exactly as it is in the visual presentation?
73. In what ways did this product work the way you expected, or not?
74. What made you trust or distrust this product?
75. What made the information here feel credible or not credible?
76. What made the product feel reliable or unreliable?
77. What made you feel confident or uncertain while using it?
78. What, if anything, made you hesitate before taking action?
79. What concerns, if any, did you have about accuracy, privacy, or safety?
80. What did any privacy, security, or confidentiality language mean to you?
81. How, if at all, did using this product affect your trust in it?
82. What would make you more comfortable relying on this product?
83. What made the product feel honest and transparent, or not?
84. What would help you feel more confident that your information is handled well?
85. What did you like best about this product?
86. What did you like least about this product?
87. What should be improved first?
88. How would you improve it?
89. What feels missing from this product?
90. What would you add to make this more useful?
91. How does this compare with the way you usually do this today?
92. How does this compare with other products you use for similar tasks?
93. Tell me about a recent time this product worked especially well for you.
94. What made that experience work well?
95. Tell me about a recent time this product worked poorly for you.
96. What made that experience work poorly?
97. What would make you want to use this again?
98. What would make you stop using this?
99. Is there anything else you would like to share about this experience?
`
  .trim()
  .split("\n")
  .map((line) => line.replace(/^\d+\.\s*/, "").trim());

export const GENERAL_DEFAULT_TEMPLATE_IDS = ["q033"] as const;
export const GENERAL_DEFAULT_PARAGRAPH_TEMPLATE_IDS = ["gp001", "gp087"] as const;

export const GENERAL_PARAGRAPH_QUESTION_BANK: readonly GeneralParagraphQuestionTemplate[] =
  GENERAL_PARAGRAPH_QUESTION_PROMPTS.map((prompt, index) => ({
    id: `gp${String(index + 1).padStart(3, "0")}`,
    prompt,
  }));

export const GENERAL_QUESTION_BANK: readonly GeneralQuestionTemplate[] = [
  { id: "q001", prompt: "How likely are you to want to use this product frequently?", options: VERY_UNLIKELY_SCALE },
  { id: "q002", prompt: "To what extent did this product feel more complex than it needed to be?", options: EXTENT_SCALE },
  { id: "q003", prompt: "How easy was this product to use?", options: EASY_SCALE },
  { id: "q004", prompt: "How much support from a technical person would you need to use this product well?", options: SUPPORT_SCALE },
  { id: "q005", prompt: "How well integrated did the different parts of this product feel?", options: INTEGRATED_SCALE },
  { id: "q006", prompt: "To what extent did this product feel inconsistent?", options: EXTENT_SCALE },
  { id: "q007", prompt: "How quickly do you think most people would learn to use this product?", options: SPEED_SCALE },
  { id: "q008", prompt: "How cumbersome did this product feel to use?", options: CUMBERSOME_SCALE },
  { id: "q009", prompt: "How confident did you feel while using this product?", options: CONFIDENT_SCALE },
  { id: "q010", prompt: "How much did you need to learn before you could get going with this product?", options: SUPPORT_SCALE },
  { id: "q011", prompt: "How well do this product's capabilities meet your requirements?", options: WELL_SCALE },
  { id: "q012", prompt: "How easy is this product to use?", options: EASY_SCALE },
  { id: "q013", prompt: "Overall, how easy or difficult was this task?", options: EASY_SCALE },
  { id: "q014", prompt: "How satisfied were you with how easy it was to complete this task?", options: SATISFIED_SCALE },
  { id: "q015", prompt: "How satisfied were you with the amount of time it took to complete this task?", options: SATISFIED_SCALE },
  { id: "q016", prompt: "How satisfied were you with the help and information available while completing this task?", options: SATISFIED_SCALE },
  { id: "q017", prompt: "How effectively could you complete what you needed to do with this product?", options: EFFECTIVELY_SCALE },
  { id: "q018", prompt: "How quickly could you complete what you needed to do with this product?", options: SPEED_SCALE },
  { id: "q019", prompt: "How efficiently could you complete what you needed to do with this product?", options: ["Not at all efficiently", "Slightly efficiently", "Moderately efficiently", "Very efficiently", "Extremely efficiently"] },
  { id: "q020", prompt: "How comfortable did you feel using this product?", options: COMFORTABLE_SCALE },
  { id: "q021", prompt: "How easy was it to learn to use this product?", options: EASY_SCALE },
  { id: "q022", prompt: "How quickly could you become productive with this product?", options: SPEED_SCALE },
  { id: "q023", prompt: "How clearly did error messages tell you how to fix problems?", options: CLEARLY_SCALE },
  { id: "q024", prompt: "How easily and quickly could you recover when you made a mistake?", options: EASILY_SCALE },
  { id: "q025", prompt: "How clear was the information provided by the product?", options: CLEAR_SCALE },
  { id: "q026", prompt: "How easy was it to find the information you needed?", options: EASY_SCALE },
  { id: "q027", prompt: "How effective was the information the product gave you in helping you complete tasks?", options: EFFECTIVE_SCALE },
  { id: "q028", prompt: "How well did the product organize information in a way that made sense?", options: WELL_SCALE },
  { id: "q029", prompt: "How pleasant was the interface of this product?", options: ["Very unpleasant", "Unpleasant", "Neither pleasant nor unpleasant", "Pleasant", "Very pleasant"] },
  { id: "q030", prompt: "How much did you like using this product's interface?", options: VERY_MUCH_SCALE },
  { id: "q031", prompt: "How well does this product have the functions and capabilities you expect it to have?", options: WELL_SCALE },
  { id: "q032", prompt: "How easy is this product to use?", options: EASY_SCALE },
  { id: "q033", prompt: "How easy is it to navigate within this product?", options: EASY_SCALE },
  { id: "q034", prompt: "How credible is the information or content in this product?", options: CREDIBLE_SCALE },
  { id: "q035", prompt: "How trustworthy is the information or content in this product?", options: TRUSTWORTHY_SCALE },
  { id: "q036", prompt: "How attractive do you find this product?", options: ATTRACTIVE_SCALE },
  { id: "q037", prompt: "How clean and simple is this product's presentation?", options: ["Not at all clean and simple", "Slightly clean and simple", "Moderately clean and simple", "Very clean and simple", "Extremely clean and simple"] },
  { id: "q038", prompt: "How likely are you to use this product again in the future?", options: VERY_UNLIKELY_SCALE },
  { id: "q039", prompt: "How likely are you to recommend this product to a friend or colleague?", options: RECOMMEND_SCALE },
  { id: "q040", prompt: "How would you rate this product on a scale from obstructive to supportive?", options: NEUTRAL_SUPPORTIVE_SCALE },
  { id: "q041", prompt: "How would you rate this product on a scale from complicated to easy?", options: NEUTRAL_EASY_SCALE },
  { id: "q042", prompt: "How would you rate this product on a scale from inefficient to efficient?", options: NEUTRAL_EFFICIENT_SCALE },
  { id: "q043", prompt: "How would you rate this product on a scale from confusing to clear?", options: NEUTRAL_CLEAR_SCALE },
  { id: "q044", prompt: "How would you rate this product on a scale from boring to exciting?", options: NEUTRAL_EXCITING_SCALE },
  { id: "q045", prompt: "How would you rate this product on a scale from not interesting to interesting?", options: NEUTRAL_INTERESTING_SCALE },
  { id: "q046", prompt: "How would you rate this product on a scale from conventional to inventive?", options: NEUTRAL_INVENTIVE_SCALE },
  { id: "q047", prompt: "How would you rate this product on a scale from usual to leading-edge?", options: NEUTRAL_LEADING_EDGE_SCALE },
  { id: "q048", prompt: "How would you rate this product on a scale from human to technical?", options: NEUTRAL_TECHNICAL_SCALE },
  { id: "q049", prompt: "How would you rate this product on a scale from isolating to connective?", options: NEUTRAL_CONNECTIVE_SCALE },
  { id: "q050", prompt: "How would you rate this product on a scale from unpleasant to pleasant?", options: NEUTRAL_PLEASANT_SCALE },
  { id: "q051", prompt: "How would you rate this product on a scale from conventional to inventive?", options: NEUTRAL_INVENTIVE_SCALE },
  { id: "q052", prompt: "How would you rate this product on a scale from complicated to simple?", options: NEUTRAL_SIMPLE_SCALE },
  { id: "q053", prompt: "How would you rate this product on a scale from unprofessional to professional?", options: NEUTRAL_PROFESSIONAL_SCALE },
  { id: "q054", prompt: "How would you rate this product on a scale from ugly to attractive?", options: NEUTRAL_ATTRACTIVE_SCALE },
  { id: "q055", prompt: "How would you rate this product on a scale from impractical to practical?", options: NEUTRAL_PRACTICAL_SCALE },
  { id: "q056", prompt: "How would you rate this product on a scale from disagreeable to likeable?", options: NEUTRAL_LIKEABLE_SCALE },
  { id: "q057", prompt: "How would you rate this product on a scale from cumbersome to straightforward?", options: NEUTRAL_STRAIGHTFORWARD_SCALE },
  { id: "q058", prompt: "How mentally demanding was using this product for the task you just completed?", options: LOW_HIGH_SCALE },
  { id: "q059", prompt: "How physically demanding was it to use this product for the task you just completed?", options: LOW_HIGH_SCALE },
  { id: "q060", prompt: "How rushed or time-pressured did you feel while using this product?", options: PRESSURE_SCALE },
  { id: "q061", prompt: "How successful were you in accomplishing what you wanted to do?", options: SUCCESS_SCALE },
  { id: "q062", prompt: "How hard did you have to work to accomplish that level of performance?", options: LOW_HIGH_SCALE },
  { id: "q063", prompt: "How frustrated, stressed, or annoyed did you feel while using this product?", options: PRESSURE_SCALE },
  { id: "q064", prompt: "How much do you trust this product?", options: TRUST_SCALE },
  { id: "q065", prompt: "How competent do you believe this product is at helping you do what you need to do?", options: COMPETENT_SCALE },
  { id: "q066", prompt: "How reliably do you believe this product behaves?", options: RELIABLY_SCALE },
  { id: "q067", prompt: "To what extent do you believe this product acts in your best interest?", options: TRUST_SCALE },
  { id: "q068", prompt: "To what extent do you believe this product handles your information honestly and responsibly?", options: TRUST_SCALE },
  { id: "q069", prompt: "To what extent do you believe this product keeps its promises?", options: TRUST_SCALE },
  { id: "q070", prompt: "How safe do you feel relying on this product?", options: SAFE_SCALE },
  { id: "q071", prompt: "How comfortable are you depending on this product for important tasks?", options: COMFORTABLE_SCALE },
  { id: "q072", prompt: "How transparent is this product about what it is doing?", options: TRANSPARENT_SCALE },
  { id: "q073", prompt: "How predictably does this product behave?", options: PREDICTABLY_SCALE },
  { id: "q074", prompt: "How well do you believe this product helps protect you from avoidable problems?", options: WELL_SCALE },
  { id: "q075", prompt: "How willing would you be to rely on this product again?", options: WILLING_SCALE },
  { id: "q076", prompt: "How much does using this product help you accomplish tasks more quickly?", options: VERY_MUCH_SCALE },
  { id: "q077", prompt: "How much does using this product improve your performance?", options: VERY_MUCH_SCALE },
  { id: "q078", prompt: "How much does using this product increase your productivity?", options: VERY_MUCH_SCALE },
  { id: "q079", prompt: "How much does using this product enhance your effectiveness?", options: VERY_MUCH_SCALE },
  { id: "q080", prompt: "Overall, how useful do you find this product?", options: ["Not at all useful", "Slightly useful", "Moderately useful", "Very useful", "Extremely useful"] },
  { id: "q081", prompt: "How easy is it for you to learn to use this product?", options: EASY_SCALE },
  { id: "q082", prompt: "How clear and understandable is your interaction with this product?", options: CLEAR_SCALE },
  { id: "q083", prompt: "How easy is it for you to get this product to do what you want it to do?", options: EASY_SCALE },
  { id: "q084", prompt: "How likely are you to use this product in the future?", options: VERY_UNLIKELY_SCALE },
  { id: "q085", prompt: "How much does everything in this product feel like it goes together?", options: TRUST_SCALE },
  { id: "q086", prompt: "How pleasantly varied is the layout of this product?", options: EXTENT_SCALE },
  { id: "q087", prompt: "How attractive is this product's color composition?", options: ATTRACTIVE_SCALE },
  { id: "q088", prompt: "How professionally designed does this layout appear?", options: PROFESSIONAL_SCALE },
  { id: "q089", prompt: "Overall, how satisfied are you with this product?", options: SATISFIED_SCALE },
  { id: "q090", prompt: "Compared with your expectations, how well did this product perform?", options: EXPECTATION_SCALE },
  { id: "q091", prompt: "Compared with your ideal product for this kind of task, how close is this product to ideal?", options: IDEAL_SCALE },
  { id: "q092", prompt: "Given the value you get, how would you rate this product overall?", options: VALUE_SCALE },
  { id: "q093", prompt: "Given the quality of this product, how would you rate what it asks of you in time, effort, or cost?", options: VALUE_FOR_EFFORT_SCALE },
  { id: "q094", prompt: "How likely are you to choose this product again for a similar need?", options: VERY_UNLIKELY_SCALE },
  { id: "q095", prompt: "How easy is this product to use?", options: EASY_SCALE },
  { id: "q096", prompt: "How useful is the information or content in this product?", options: ["Not at all useful", "Slightly useful", "Moderately useful", "Very useful", "Extremely useful"] },
  { id: "q097", prompt: "How clear is the information or content in this product?", options: CLEAR_SCALE },
  { id: "q098", prompt: "How easy is the overall process or workflow in this product?", options: EASY_SCALE },
  { id: "q099", prompt: "How confident are you that this product will do a good job for you in the future?", options: CONFIDENT_SCALE },
] as const;
