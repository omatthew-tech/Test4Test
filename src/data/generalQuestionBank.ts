export interface GeneralQuestionTemplate {
  id: string;
  prompt: string;
  options: readonly string[];
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

const NPS_SCALE = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

const LOW_HIGH_SCALE = [
  "Very low",
  "Low",
  "Somewhat low",
  "Moderate",
  "Somewhat high",
  "High",
  "Very high",
] as const;

const PRESSURE_SCALE = [
  "Not at all",
  "Slightly",
  "Somewhat",
  "Moderately",
  "Quite a bit",
  "Very",
  "Extremely",
] as const;

const SUCCESS_SCALE = [
  "Not at all successful",
  "Slightly successful",
  "Somewhat successful",
  "Moderately successful",
  "Very successful",
  "Highly successful",
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
  "Mostly obstructive",
  "Slightly obstructive",
  "Neutral",
  "Slightly supportive",
  "Mostly supportive",
  "Supportive",
] as const;
const NEUTRAL_EASY_SCALE = [
  "Complicated",
  "Mostly complicated",
  "Slightly complicated",
  "Neutral",
  "Slightly easy",
  "Mostly easy",
  "Easy",
] as const;
const NEUTRAL_EFFICIENT_SCALE = [
  "Inefficient",
  "Mostly inefficient",
  "Slightly inefficient",
  "Neutral",
  "Slightly efficient",
  "Mostly efficient",
  "Efficient",
] as const;
const NEUTRAL_CLEAR_SCALE = [
  "Confusing",
  "Mostly confusing",
  "Slightly confusing",
  "Neutral",
  "Slightly clear",
  "Mostly clear",
  "Clear",
] as const;
const NEUTRAL_EXCITING_SCALE = [
  "Boring",
  "Mostly boring",
  "Slightly boring",
  "Neutral",
  "Slightly exciting",
  "Mostly exciting",
  "Exciting",
] as const;
const NEUTRAL_INTERESTING_SCALE = [
  "Not interesting",
  "Mostly not interesting",
  "Slightly not interesting",
  "Neutral",
  "Slightly interesting",
  "Mostly interesting",
  "Interesting",
] as const;
const NEUTRAL_INVENTIVE_SCALE = [
  "Conventional",
  "Mostly conventional",
  "Slightly conventional",
  "Neutral",
  "Slightly inventive",
  "Mostly inventive",
  "Inventive",
] as const;
const NEUTRAL_LEADING_EDGE_SCALE = [
  "Usual",
  "Mostly usual",
  "Slightly usual",
  "Neutral",
  "Slightly leading-edge",
  "Mostly leading-edge",
  "Leading-edge",
] as const;
const NEUTRAL_TECHNICAL_SCALE = [
  "Human",
  "Mostly human",
  "Slightly human",
  "Neutral",
  "Slightly technical",
  "Mostly technical",
  "Technical",
] as const;
const NEUTRAL_CONNECTIVE_SCALE = [
  "Isolating",
  "Mostly isolating",
  "Slightly isolating",
  "Neutral",
  "Slightly connective",
  "Mostly connective",
  "Connective",
] as const;
const NEUTRAL_PLEASANT_SCALE = [
  "Unpleasant",
  "Mostly unpleasant",
  "Slightly unpleasant",
  "Neutral",
  "Slightly pleasant",
  "Mostly pleasant",
  "Pleasant",
] as const;
const NEUTRAL_SIMPLE_SCALE = [
  "Complicated",
  "Mostly complicated",
  "Slightly complicated",
  "Neutral",
  "Slightly simple",
  "Mostly simple",
  "Simple",
] as const;
const NEUTRAL_PROFESSIONAL_SCALE = [
  "Unprofessional",
  "Mostly unprofessional",
  "Slightly unprofessional",
  "Neutral",
  "Slightly professional",
  "Mostly professional",
  "Professional",
] as const;
const NEUTRAL_ATTRACTIVE_SCALE = [
  "Ugly",
  "Mostly ugly",
  "Slightly ugly",
  "Neutral",
  "Slightly attractive",
  "Mostly attractive",
  "Attractive",
] as const;
const NEUTRAL_PRACTICAL_SCALE = [
  "Impractical",
  "Mostly impractical",
  "Slightly impractical",
  "Neutral",
  "Slightly practical",
  "Mostly practical",
  "Practical",
] as const;
const NEUTRAL_LIKEABLE_SCALE = [
  "Disagreeable",
  "Mostly disagreeable",
  "Slightly disagreeable",
  "Neutral",
  "Slightly likeable",
  "Mostly likeable",
  "Likeable",
] as const;
const NEUTRAL_STRAIGHTFORWARD_SCALE = [
  "Cumbersome",
  "Mostly cumbersome",
  "Slightly cumbersome",
  "Neutral",
  "Slightly straightforward",
  "Mostly straightforward",
  "Straightforward",
] as const;

export const GENERAL_DEFAULT_TEMPLATE_IDS = ["q003", "q033", "q080", "q089"] as const;

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
  { id: "q039", prompt: "How likely are you to recommend this product to a friend or colleague?", options: NPS_SCALE },
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
