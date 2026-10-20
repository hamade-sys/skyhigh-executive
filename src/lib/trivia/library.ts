/**
 * ICAN Trivia — starter content library.
 *
 * ICAN-authored boards and columns shipped in code. They appear in the
 * hub as "ICAN library" templates and in the column bank's library tab.
 * Hosts copy them into their own boards before editing, so this file is
 * the single source of truth for the starter content.
 *
 * Content rules (keep them when adding questions):
 *  - Only stable, well-established facts. Nothing that changes year to
 *    year (office-holders, rankings, populations, prices). Records carry
 *    a year ("when it opened in 2010 …").
 *  - One unambiguous answer; alternates go in `notes` ("Also accept: …").
 *  - Difficulty rises from 200 (most people know it) to 1000.
 *  - Nothing political or religious, no private individuals, no client
 *    names. Quoted text stays under 15 words.
 */
import type {
  LibraryTemplate,
  TriviaColumn,
  TriviaContent,
  TriviaFinal,
  TriviaQuestion,
  TriviaSettings,
} from "./types";
import { DEFAULT_SETTINGS, defaultSettings } from "./content";

/** Library boards play with the standard house rules (content.ts → DEFAULT_SETTINGS). */
export const LIBRARY_DEFAULT_SETTINGS: TriviaSettings = DEFAULT_SETTINGS;

// ─── Builders ───────────────────────────────────────────────

/** One clue as authored: question, answer, optional hint and host note. */
interface Clue {
  q: string;
  a: string;
  /** Hint a team unlocks in Competitive. Never contains the answer. */
  h?: string;
  n?: string;
  dd?: true;
}

/** Exactly five clues per column, top (200) to bottom (1000). */
type FiveClues = [Clue, Clue, Clue, Clue, Clue];

/** Builds a column; question ids are `<columnId>-q1` … `-q5`, values 200–1000. */
function column(id: string, title: string, clues: FiveClues): TriviaColumn {
  return {
    id,
    title,
    questions: clues.map((clue, i): TriviaQuestion => {
      const question: TriviaQuestion = {
        id: `${id}-q${i + 1}`,
        value: (i + 1) * 200,
        question: clue.q,
        answer: clue.a,
      };
      if (clue.h) question.hint = clue.h;
      if (clue.n) question.notes = clue.n;
      if (clue.dd) question.dailyDouble = true;
      return question;
    }),
  };
}

function content(columns: TriviaColumn[], final: Omit<TriviaFinal, "enabled">): TriviaContent {
  return {
    schema: 1,
    columns,
    final: { enabled: true, ...final },
    settings: defaultSettings(),
  };
}

// ─── 1. Leadership Essentials ───────────────────────────────

const LEADERSHIP_ESSENTIALS: LibraryTemplate = {
  id: "lib:leadership-essentials",
  title: "Leadership Essentials",
  description:
    "A 30-question board for leadership workshops, management offsites and executive programmes.",
  tags: ["leadership", "strategy", "management"],
  content: content(
    [
      column("lib-lead-c1", "Leadership Thinkers", [
        {
          q: "Which management thinker, often called the father of modern management, wrote 'The Effective Executive'?",
          a: "Peter Drucker",
          h: "Vienna-born writer who taught for decades in Claremont, California.",
          n: "He is also credited with coining the term 'knowledge worker' in 1959.",
        },
        {
          q: "Robert Greenleaf coined which leadership term in 1970 for leaders who put serving others first?",
          a: "Servant leadership",
          h: "It flips the pyramid: the leader works for the team, not the reverse.",
          n: "From his 1970 essay 'The Servant as Leader'. Also accept: Servant leader.",
        },
        {
          q: "James MacGregor Burns contrasted transactional leadership with which style, which inspires people beyond self-interest?",
          a: "Transformational leadership",
          h: "These leaders don't just trade rewards for effort; they change people.",
          n: "From Burns' 1978 book 'Leadership'; Bernard Bass expanded it. Also accept: Transforming leadership.",
        },
        {
          q: "In 'Good to Great', Jim Collins gives what name to leaders who blend personal humility with professional will?",
          a: "Level 5 leaders",
          h: "It's a number: the top rung of Collins' leadership hierarchy.",
          n: "Also accept: Level 5 Leadership. It is the top of Collins' five-level hierarchy.",
        },
        {
          q: "Paul Hersey created the Situational Leadership model with which co-author?",
          a: "Ken Blanchard",
          h: "He later co-wrote 'The One Minute Manager'.",
          n: "Blanchard later co-wrote 'The One Minute Manager' (1982) with Spencer Johnson.",
        },
      ]),
      column("lib-lead-c2", "Strategy Classics", [
        {
          q: "In a SWOT analysis, what does the 'T' stand for?",
          a: "Threats",
          h: "An external factor, and not a good one.",
          n: "Strengths, Weaknesses, Opportunities, Threats.",
        },
        {
          q: "Michael Porter's famous framework analyses an industry through how many competitive forces?",
          a: "Five",
          h: "A small number; buyers and suppliers are two of them.",
          n: "Rivalry, new entrants, substitutes, buyer power, supplier power. First set out in HBR in 1979.",
        },
        {
          q: "Blue Ocean Strategy urges firms to leave crowded, cut-throat markets, which it calls oceans of what colour?",
          a: "Red",
          h: "Think of shark-infested water after a feeding frenzy.",
          n: "Also accept: Red oceans. The 2005 book is by INSEAD's W. Chan Kim and Renée Mauborgne.",
        },
        {
          q: "In the Ansoff matrix, what is the strategy of launching new products into new markets?",
          a: "Diversification",
          h: "When both product and market are new, you're spreading your bets.",
          n: "The other three: market penetration, market development and product development.",
        },
        {
          q: "Prahalad and Hamel's 1990 HBR article named which idea for a firm's deep, hard-to-copy capabilities?",
          a: "Core competence",
          h: "They pictured a firm as a tree; this is its hidden root system.",
          n: "Also accept: Core competencies. The article: 'The Core Competence of the Corporation'.",
        },
      ]),
      column("lib-lead-c3", "Change Management", [
        {
          q: "How many steps are in John Kotter's classic model for leading change?",
          a: "Eight",
          h: "An even number under ten; step one is creating urgency.",
          n: "Step one is creating a sense of urgency. Set out in his 1996 book 'Leading Change'.",
        },
        {
          q: "Kurt Lewin's three-stage change model runs unfreeze, change and what?",
          a: "Refreeze",
          h: "Think ice: after melting and reshaping, you make the new shape solid.",
          n: "Also accept: Freeze.",
        },
        {
          q: "In Prosci's ADKAR change model, what does the 'K' stand for?",
          a: "Knowledge",
          h: "After Desire, people need to understand how to change.",
          n: "Awareness, Desire, Knowledge, Ability, Reinforcement. Created by Prosci founder Jeff Hiatt.",
        },
        {
          q: "Which Kurt Lewin tool maps the forces driving a change against the forces restraining it?",
          a: "Force field analysis",
          h: "Picture a tug of war: drivers pull one way, restrainers the other.",
          n: "Also accept: Force field diagram.",
        },
        {
          q: "At the centre of the McKinsey 7-S framework, linking the other six, is which 'S'?",
          a: "Shared values",
          h: "Think culture: the beliefs everyone in the firm holds in common.",
          n: "Also accept: Superordinate goals (its original name). The others: strategy, structure, systems, style, staff, skills.",
        },
      ]),
      column("lib-lead-c4", "Emotional Intelligence", [
        {
          q: "Which psychologist and science journalist popularised emotional intelligence with a 1995 bestseller?",
          a: "Daniel Goleman",
          h: "A former New York Times science writer with a Harvard PhD.",
          n: "The book's subtitle: 'Why It Can Matter More Than IQ'.",
        },
        {
          q: "Emotional intelligence is often scored with a two-letter abbreviation that echoes IQ. What is it?",
          a: "EQ",
          h: "Keep IQ's second letter; the first comes from the subject itself.",
          n: "Emotional quotient. EI is also used for the concept itself.",
        },
        {
          q: "Goleman's leadership model lists self-awareness, self-regulation, motivation, social skill and which fifth element?",
          a: "Empathy",
          h: "Think 'walking a mile in someone else's shoes'.",
          n: "From his 1998 Harvard Business Review article 'What Makes a Leader?'.",
        },
        {
          q: "Goleman coined which phrase for when the brain's emotional centre overrides rational thinking?",
          a: "Amygdala hijack",
          h: "Two words: an almond-shaped brain part, then a word for seizing control.",
          n: "The amygdala is a small, almond-shaped region deep in the brain.",
        },
        {
          q: "Psychologist Peter Salovey and which colleague published the first formal theory of emotional intelligence in 1990?",
          a: "John Mayer",
          h: "He shares his name with a well-known American singer-songwriter.",
          n: "Also accept: John D. Mayer (the psychologist, not the singer). Their model has four branches.",
        },
      ]),
      column("lib-lead-c5", "Decisions & Biases", [
        {
          q: "What do we call the tendency to favour information that confirms what we already believe?",
          a: "Confirmation bias",
          h: "We seek evidence that proves us right and ignore the rest.",
        },
        {
          q: "Continuing to fund a failing project because of what has already been spent is known as what fallacy?",
          a: "Sunk cost fallacy",
          h: "Think of money already gone, like a ship at the bottom of the sea.",
          n: "Also accept: Sunk cost effect / Concorde fallacy.",
        },
        {
          q: "Irving Janis built a famous theory around which term, for when a group's wish for harmony kills critical thinking?",
          a: "Groupthink",
          h: "A compound word: a team trying so hard to agree it stops reasoning.",
          n: "The word itself first appeared in Fortune magazine in 1952, coined by William H. Whyte.",
        },
        {
          q: "Kahneman and Tversky's 1979 theory, showing that losses loom larger than equal gains, is called what?",
          a: "Prospect theory",
          h: "Its central finding is loss aversion; first word also means a sales lead.",
          n: "Its core finding is known as loss aversion. Kahneman won the 2002 Nobel in economics.",
          dd: true,
        },
        {
          q: "Herbert Simon blended 'satisfy' and 'suffice' into which word for picking an option that is good enough?",
          a: "Satisficing",
          h: "The opposite of maximising: settle for the first acceptable option.",
          n: "Simon introduced it in 1956 and won the 1978 Nobel in economics.",
        },
      ]),
      column("lib-lead-c6", "Business Acronyms", [
        {
          q: "In business, what does KPI stand for?",
          a: "Key performance indicator",
          h: "Three words for the vital metrics on a business dashboard.",
        },
        {
          q: "In SMART goals, what does the 'M' stand for?",
          a: "Measurable",
          h: "Can you track it with a number? That's what this letter asks.",
          n: "Usually Specific, Measurable, Achievable, Relevant, Time-bound. From a 1981 article by George Doran.",
        },
        {
          q: "In a RACI chart, what do the four letters stand for?",
          a: "Responsible, Accountable, Consulted, Informed",
          h: "Who does it, who owns it, who's asked, who's kept in the loop.",
          n: "Good practice: only one person is Accountable for each task.",
        },
        {
          q: "What does VUCA, a term that emerged at the US Army War College, stand for?",
          a: "Volatility, uncertainty, complexity, ambiguity",
          h: "Four nouns for a turbulent, unpredictable, messy world.",
          n: "Also accept: Volatile, uncertain, complex, ambiguous.",
        },
        {
          q: "What does MECE, the consultant's rule for structuring a problem, stand for?",
          a: "Mutually exclusive, collectively exhaustive",
          h: "No overlaps between the parts, and no gaps left over.",
          n: "Popularised by Barbara Minto at McKinsey. Usually pronounced 'mee-see'.",
        },
      ]),
    ],
    {
      category: "Management Classics",
      question:
        "In which 1954 book did Peter Drucker popularise 'management by objectives', an ancestor of today's OKRs?",
      answer: "The Practice of Management",
      notes: "Accept close variants of the title. OKRs were later developed by Andy Grove at Intel.",
    },
  ),
};

// ─── 2. People & HR Mastery ─────────────────────────────────

const PEOPLE_HR: LibraryTemplate = {
  id: "lib:people-hr",
  title: "People & HR Mastery",
  description: "A 30-question board for HR teams, people managers and L&D sessions.",
  tags: ["hr", "people", "talent"],
  content: content(
    [
      column("lib-hr-c1", "Talent Acquisition", [
        {
          q: "In recruiting software, what does ATS stand for?",
          a: "Applicant tracking system",
          h: "The software that follows each candidate from CV to hire.",
        },
        {
          q: "Which interview technique has candidates describe a Situation, Task, Action and Result?",
          a: "STAR method",
          h: "The four initials spell something that twinkles at night.",
          n: "Also accept: STAR. Used to structure answers to behavioural interview questions.",
        },
        {
          q: "In HR slang, what is a 'boomerang' employee?",
          a: "A rehired former employee",
          h: "What does a boomerang do after you throw it?",
          n: "Accept any answer meaning someone who leaves and later returns to the same employer.",
        },
        {
          q: "In employer branding, what does EVP stand for?",
          a: "Employee value proposition",
          h: "The 'offer' a company makes to its people in exchange for their work.",
          n: "Also accept: Employer value proposition.",
        },
        {
          q: "Which assessment-centre exercise gives candidates a simulated inbox of tasks to prioritise under time pressure?",
          a: "In-tray exercise",
          h: "Named after where incoming memos piled up on an old-style desk.",
          n: "Also accept: In-basket exercise / e-tray exercise.",
        },
      ]),
      column("lib-hr-c2", "Performance Management", [
        {
          q: "What does the goal-setting abbreviation OKR stand for?",
          a: "Objectives and key results",
          h: "Goals, plus the trackable outcomes that show you've hit them.",
          n: "Developed by Andy Grove at Intel and brought to Google by John Doerr in 1999.",
        },
        {
          q: "What name is given to feedback gathered from a person's manager, peers, direct reports and others?",
          a: "360-degree feedback",
          h: "Think of a full circle: input from every direction.",
          n: "Also accept: 360 feedback / multi-rater feedback.",
        },
        {
          q: "What is the term for a meeting where managers compare and align ratings across teams for fairness?",
          a: "Calibration",
          h: "The same word is used for adjusting instruments so they read accurately.",
          n: "Also accept: Calibration session / calibration meeting.",
        },
        {
          q: "The talent grid that plots performance against potential has how many boxes?",
          a: "Nine",
          h: "A perfect square: the grid is named after how many cells it has.",
          n: "The '9-box grid', adapted from the GE-McKinsey matrix for business portfolios.",
        },
        {
          q: "What is the opposite of the halo effect, when one negative trait drags down every rating?",
          a: "Horn effect",
          h: "Halo is angelic; its opposite borrows from the devil's head.",
          n: "Also accept: Horns effect / reverse halo effect. Edward Thorndike named the halo effect in 1920.",
        },
      ]),
      column("lib-hr-c3", "Learning & Development", [
        {
          q: "In the 70-20-10 learning model, what percentage of learning comes from on-the-job experience?",
          a: "70%",
          h: "Learning by doing gets the lion's share.",
          n: "20% comes from other people (coaching, feedback) and 10% from formal training.",
        },
        {
          q: "Donald Kirkpatrick's model evaluates training at how many levels?",
          a: "Four",
          h: "Level one is the trainees' reaction; the last is impact on the business.",
          n: "Reaction, Learning, Behaviour, Results.",
        },
        {
          q: "Hermann Ebbinghaus charted how fast we lose new information without review. What is this curve called?",
          a: "Forgetting curve",
          h: "Memory fades fast; the graph shows how much slips away over time.",
          n: "He tested his own memory with nonsense syllables and published his findings in 1885.",
        },
        {
          q: "In the 2001 revision of Bloom's taxonomy, what is the highest level of thinking?",
          a: "Create",
          h: "The 2001 levels are verbs; the top one means producing original work.",
          n: "Also accept: Creating. In Bloom's 1956 original, the top level was Evaluation.",
          dd: true,
        },
        {
          q: "Jack Phillips added a fifth level to Kirkpatrick's model. What does it measure?",
          a: "Return on investment",
          h: "Money in versus money out: the figure every CFO asks about.",
          n: "Also accept: ROI. It compares a programme's monetary benefits with its costs.",
        },
      ]),
      column("lib-hr-c4", "Compensation & Rewards", [
        {
          q: "What term covers everything an employee gets from work: pay, benefits, recognition and growth?",
          a: "Total rewards",
          h: "Two words: think the whole package, not just the salary.",
          n: "Also accept: Total reward. 'Total compensation' is narrower: pay and benefits only.",
        },
        {
          q: "What is the name for the minimum-to-maximum pay range set for a job grade?",
          a: "Pay band",
          h: "Its second word also means a group of musicians.",
          n: "Also accept: Pay range / salary band / salary range.",
        },
        {
          q: "What compa-ratio means someone is paid exactly at the midpoint of their pay range?",
          a: "1.0",
          h: "Compa-ratio is salary divided by the midpoint of the range.",
          n: "Also accept: 100%. Compa-ratio = salary divided by the range midpoint.",
        },
        {
          q: "What is it called when new hires earn nearly as much as, or more than, experienced staff in the same role?",
          a: "Pay compression",
          h: "The gap between what new hires and veterans earn gets squeezed.",
          n: "Also accept: Salary compression / wage compression.",
        },
        {
          q: "Which job evaluation method scores roles on know-how, problem solving and accountability?",
          a: "Hay method",
          h: "Its creator's surname is also what farmers bale for animal feed.",
          n: "Also accept: Hay Guide Chart / Korn Ferry Hay. Developed by Edward Hay in the mid-20th century.",
        },
      ]),
      column("lib-hr-c5", "HR Metrics", [
        {
          q: "What is the name for the rate at which employees leave an organisation over a period?",
          a: "Turnover",
          h: "The same word means a firm's annual sales, or a fruit pastry.",
          n: "Also accept: Attrition / staff turnover rate.",
        },
        {
          q: "Which recruiting metric counts the days from opening a job to an offer being accepted?",
          a: "Time-to-fill",
          h: "Three hyphenated words: how long until the empty seat is taken.",
          n: "Not to be confused with time-to-hire, which starts when the candidate enters the pipeline.",
        },
        {
          q: "In eNPS, what are employees who score 9 or 10 called?",
          a: "Promoters",
          h: "They'd actively recommend you; the opposite of detractors.",
          n: "7-8 are passives and 0-6 detractors. eNPS = % promoters minus % detractors.",
        },
        {
          q: "Which productivity metric divides an organisation's total revenue by its headcount?",
          a: "Revenue per employee",
          h: "Say the formula out loud: top line divided by people.",
          n: "Also accept: Revenue per head / revenue per FTE.",
        },
        {
          q: "Which absence measure squares the number of separate absence spells, then multiplies by total days absent?",
          a: "Bradford Factor",
          h: "Named after a city in West Yorkshire, England.",
          n: "Score = S x S x D, so frequent short absences score far higher than one long one.",
        },
      ]),
      column("lib-hr-c6", "Workplace Psychology", [
        {
          q: "What sits at the top of Maslow's hierarchy of needs?",
          a: "Self-actualisation",
          h: "Reaching your full potential: becoming all you can be.",
          n: "Also accept: Self-actualization. Maslow proposed the hierarchy in 1943.",
        },
        {
          q: "Bruce Tuckman's team stages are forming, storming, norming and what?",
          a: "Performing",
          h: "Rhymes with the other three: the team now delivers at its best.",
          n: "A fifth stage, adjourning, was added in 1977.",
        },
        {
          q: "Frederick Herzberg split work factors into motivators and which other type, such as pay and conditions?",
          a: "Hygiene factors",
          h: "Like cleanliness: lacking them upsets people, but they don't motivate.",
          n: "Also accept: Maintenance factors. From his 1959 two-factor theory.",
        },
        {
          q: "Which Harvard Business School professor is best known for research on psychological safety in teams?",
          a: "Amy Edmondson",
          h: "Author of 'The Fearless Organization' (2018); her first name is short.",
          n: "Google's Project Aristotle later found psychological safety mattered most for team effectiveness.",
        },
        {
          q: "The 'Hawthorne effect' is named after a Western Electric factory near which US city?",
          a: "Chicago",
          h: "A large city on the south-west shore of Lake Michigan.",
          n: "Also accept: Cicero, Illinois, where the Hawthorne Works stood. The studies ran from 1924 to 1932.",
        },
      ]),
    ],
    {
      category: "HR Thinkers",
      question:
        "Dave Ulrich's 1997 HR model names four roles: strategic partner, administrative expert, change agent and which other?",
      answer: "Employee champion",
      notes: "From his book 'Human Resource Champions'. His work inspired the HR business partner model.",
    },
  ),
};

// ─── 3. MENA Business & Region ──────────────────────────────

const MENA_BUSINESS: LibraryTemplate = {
  id: "lib:mena-business",
  title: "MENA Business & Region",
  description:
    "A 30-question board on the Gulf and the wider region for team events and client sessions in MENA.",
  tags: ["mena", "gcc", "business", "region"],
  content: content(
    [
      column("lib-mena-c1", "GCC Economies", [
        {
          q: "Saudi Arabia's economic transformation plan, launched in 2016, is named after which year?",
          a: "2030",
          h: "A round-number target year, more than a decade after the launch.",
          n: "Saudi Vision 2030 aims to diversify the economy away from oil.",
        },
        {
          q: "How many member states make up the Gulf Cooperation Council?",
          a: "Six",
          h: "Saudi Arabia, the UAE and Kuwait are three of them; count the rest.",
          n: "Saudi Arabia, the UAE, Kuwait, Qatar, Bahrain and Oman.",
        },
        {
          q: "Expo 2020 Dubai was postponed by a year. In which month and year did it open?",
          a: "October 2021",
          h: "It opened in the autumn, a year after its planned date.",
          n: "It ran from 1 October 2021 to 31 March 2022.",
        },
        {
          q: "OPEC was founded in 1960 at a conference in which capital city?",
          a: "Baghdad",
          h: "It's the capital of one of OPEC's five founding members.",
          n: "The five founders: Iran, Iraq, Kuwait, Saudi Arabia and Venezuela. Its HQ is now in Vienna.",
        },
        {
          q: "The GCC's charter was signed in May 1981 in which city?",
          a: "Abu Dhabi",
          h: "A Gulf capital, but not Riyadh, the GCC's home base.",
          n: "The GCC's Secretariat General is based in Riyadh.",
        },
      ]),
      column("lib-mena-c2", "Gulf Aviation", [
        {
          q: "Which Dubai airline made its first flight in 1985?",
          a: "Emirates",
          h: "Its name comes from the federation it calls home.",
          n: "Its first flight, in October 1985, went from Dubai to Karachi.",
        },
        {
          q: "What is the three-letter airport code for Dubai International?",
          a: "DXB",
          h: "Starts with the city's initial, like most codes; you'll see it on bag tags.",
        },
        {
          q: "Etihad Airways, founded in 2003, is based in which city?",
          a: "Abu Dhabi",
          h: "The largest emirate by land area.",
        },
        {
          q: "Al Maktoum International Airport is also known by the name of the Dubai district it serves. What is it?",
          a: "Dubai World Central",
          h: "Three words, starting with the city's name; think global hub.",
          n: "Also accept: DWC. The airport opened to cargo flights in 2010.",
        },
        {
          q: "Which airline, founded in 1950 and later co-owned by Bahrain, Qatar, Abu Dhabi and Oman, is one of the Gulf's oldest?",
          a: "Gulf Air",
          h: "Bahrain's national carrier, whose name is just two short words.",
          n: "It began as the Gulf Aviation Company and is now Bahrain's national carrier.",
        },
      ]),
      column("lib-mena-c3", "Landmarks & Architecture", [
        {
          q: "Which Dubai skyscraper became the world's tallest building when it opened in 2010?",
          a: "Burj Khalifa",
          h: "It stands 828 metres tall in Downtown Dubai.",
          n: "It stands 828 metres tall.",
        },
        {
          q: "Which sail-shaped Dubai hotel, opened in 1999, stands on its own artificial island?",
          a: "Burj Al Arab",
          h: "A luxury landmark hotel standing just off Jumeirah Beach.",
        },
        {
          q: "Which torus-shaped Dubai building, opened in 2022, is wrapped in Arabic calligraphy?",
          a: "Museum of the Future",
          h: "It showcases tomorrow's ideas and tech, on Sheikh Zayed Road.",
        },
        {
          q: "The Louvre Abu Dhabi, opened in 2017, was designed by which French architect?",
          a: "Jean Nouvel",
          h: "He also designed the Institut du Monde Arabe in Paris.",
          n: "Its vast dome is a lattice of nearly 8,000 metal stars.",
        },
        {
          q: "Which ancient people carved the city of Petra, in Jordan, out of rose-red rock?",
          a: "Nabataeans",
          h: "Ancient Arab traders who grew rich on the incense routes.",
          n: "Also accept: Nabateans. Petra became a UNESCO World Heritage Site in 1985.",
        },
      ]),
      column("lib-mena-c4", "Regional Geography", [
        {
          q: "How many emirates make up the United Arab Emirates?",
          a: "Seven",
          h: "A single-digit number; Dubai, Sharjah and Ajman are three of them.",
          n: "Abu Dhabi, Dubai, Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah and Fujairah.",
        },
        {
          q: "Which strait links the Gulf to the Gulf of Oman and the Arabian Sea?",
          a: "Strait of Hormuz",
          h: "A narrow chokepoint overlooked by Musandam; vital for oil tankers.",
          n: "Also accept: Hormuz.",
        },
        {
          q: "What is the English name for the Rub' al Khali, the vast sand desert of southern Arabia?",
          a: "The Empty Quarter",
          h: "Its name describes a vast region with almost nothing in it.",
        },
        {
          q: "The Musandam Peninsula, cut off from the rest of its country by UAE territory, belongs to which country?",
          a: "Oman",
          h: "Its main territory lies to the south-east of the UAE.",
          n: "Musandam overlooks the Strait of Hormuz.",
        },
        {
          q: "Which emirate is the only one whose coastline lies entirely on the Gulf of Oman?",
          a: "Fujairah",
          h: "Its port is one of the biggest ship-refuelling hubs on Earth.",
          n: "Sharjah also has east-coast enclaves, such as Khor Fakkan, but its main coast faces the Gulf.",
        },
      ]),
      column("lib-mena-c5", "Currencies & Markets", [
        {
          q: "What is the currency of the UAE?",
          a: "Dirham",
          h: "Morocco's currency shares the same name.",
          n: "Also accept: UAE dirham / AED.",
        },
        {
          q: "One UAE dirham is divided into 100 of which smaller unit?",
          a: "Fils",
          h: "Kuwait and Bahrain use the same word for their small coins.",
        },
        {
          q: "The UAE dirham is pegged to the US dollar at roughly how many dirhams per dollar?",
          a: "3.67",
          h: "Somewhere between three and four dirhams per dollar.",
          n: "The exact rate is 3.6725. Accept anything from 3.67 to 3.6725.",
        },
        {
          q: "Saudi Arabia's main stock exchange is widely known by which Arabic name?",
          a: "Tadawul",
          h: "One Arabic word, based in Riyadh, starting with the letter T.",
          n: "Also accept: Saudi Exchange. 'Tadawul' means trading or circulation.",
        },
        {
          q: "In which year was the UAE dirham introduced?",
          a: "1973",
          h: "Two years after the country itself was founded.",
          n: "Before then, most emirates used the Qatar-Dubai riyal, and Abu Dhabi the Bahraini dinar.",
        },
      ]),
      column("lib-mena-c6", "Firsts & Records", [
        {
          q: "In which year was the United Arab Emirates founded?",
          a: "1971",
          h: "Early 1970s; National Day falls on 2 December.",
          n: "On 2 December 1971, now National Day. Ras Al Khaimah joined in February 1972.",
        },
        {
          q: "In 2022, which country hosted the first FIFA World Cup held in the Arab world?",
          a: "Qatar",
          h: "A peninsula nation whose only land border is with Saudi Arabia.",
        },
        {
          q: "What was the name of the UAE's Mars mission, which reached Mars orbit in February 2021?",
          a: "Hope",
          h: "A one-word name for wishing and expecting good things to come.",
          n: "Also accept: Al Amal / Hope Probe. The first interplanetary mission by an Arab nation.",
          dd: true,
        },
        {
          q: "In 2019, who became the first Emirati astronaut to travel to space?",
          a: "Hazza Al Mansouri",
          h: "A military pilot who spent about eight days on the ISS.",
          n: "He spent about eight days on the International Space Station.",
        },
        {
          q: "Which archaeological site became Saudi Arabia's first UNESCO World Heritage Site in 2008?",
          a: "Hegra",
          h: "An ancient city of rock-cut tombs near AlUla.",
          n: "Also accept: Al-Hijr / Mada'in Salih. It lies near AlUla.",
        },
      ]),
    ],
    {
      category: "Gulf History",
      question:
        "Before oil, the Gulf's economy depended above all on harvesting what from the sea, until the trade collapsed in the 1930s?",
      answer: "Pearls",
      notes:
        "Also accept: Pearling / pearl diving. Japanese cultured pearls and the Great Depression ended the boom.",
    },
  ),
};

// ─── 4. Team Kickoff Icebreaker ─────────────────────────────

const TEAM_KICKOFF: LibraryTemplate = {
  id: "lib:team-kickoff",
  title: "Team Kickoff Icebreaker",
  description:
    "A light 30-question general-knowledge board to warm up mixed teams at kickoffs and offsites.",
  tags: ["icebreaker", "general", "team"],
  content: content(
    [
      column("lib-kick-c1", "Movies & TV", [
        {
          q: "In Disney's 'The Lion King' (1994), what is the name of Simba's father?",
          a: "Mufasa",
          h: "Voiced by James Earl Jones, he is betrayed by his brother Scar.",
        },
        {
          q: "What is the name of the hidden African nation in Marvel's 'Black Panther'?",
          a: "Wakanda",
          h: "Its rare metal is vibranium.",
        },
        {
          q: "In the sitcom 'Friends', what is the name of the coffee house where the group hangs out?",
          a: "Central Perk",
          h: "A pun on a famous New York park.",
        },
        {
          q: "Which 1997 film became the first ever to earn over US$1 billion at the worldwide box office?",
          a: "Titanic",
          h: "A James Cameron epic starring Leonardo DiCaprio and Kate Winslet.",
          n: "It also won 11 Oscars, tying the record held by 'Ben-Hur'.",
        },
        {
          q: "Which silent film won the very first Academy Award for the top picture prize, at the 1929 ceremony?",
          a: "Wings",
          h: "A First World War aviation drama.",
          n: "The prize was then called 'Outstanding Picture'.",
        },
      ]),
      column("lib-kick-c2", "Food Around the World", [
        {
          q: "Paella, cooked in a wide shallow pan, is a classic dish from which country?",
          a: "Spain",
          h: "The same country that gave the world tapas.",
          n: "It comes from the Valencia region.",
        },
        {
          q: "Which spice, made from the stigmas of a crocus flower, is the world's most expensive by weight?",
          a: "Saffron",
          h: "It turns rice golden-yellow in Persian and Spanish dishes.",
          n: "Each flower yields just three stigmas, picked by hand.",
        },
        {
          q: "Which Italian city is considered the home of pizza Margherita?",
          a: "Naples",
          h: "The city near Mount Vesuvius.",
          n: "Legend says it was named for Queen Margherita of Italy in 1889.",
        },
        {
          q: "Halloumi, the squeaky grilling cheese, originally comes from which island?",
          a: "Cyprus",
          h: "An island nation in the eastern Mediterranean.",
        },
        {
          q: "In 1908, Japanese chemist Kikunae Ikeda identified and named which 'fifth taste'?",
          a: "Umami",
          h: "A Japanese word for the savoury taste in broth, soy sauce and parmesan.",
          n: "A savoury taste he traced to glutamate in kombu seaweed broth.",
        },
      ]),
      column("lib-kick-c3", "Sport", [
        {
          q: "How many players does each team have on the pitch at the start of a football match?",
          a: "Eleven",
          h: "More than ten; a cricket side is the same size.",
          n: "Including the goalkeeper.",
        },
        {
          q: "Which country won the 2022 FIFA World Cup in Qatar?",
          a: "Argentina",
          h: "A South American side; Lionel Messi lifted the trophy.",
          n: "They beat France on penalties after a 3-3 draw in the final.",
        },
        {
          q: "In which city were the first modern Olympic Games held, in 1896?",
          a: "Athens",
          h: "The capital of the country where the ancient Games began.",
        },
        {
          q: "In golf, what is an 'albatross'?",
          a: "Three under par on a hole",
          h: "Birdie, eagle... this is the next, rarer bird up the scale.",
          n: "Also called a double eagle. A birdie is one under par, an eagle two under.",
        },
        {
          q: "Which country won the first FIFA World Cup in 1930?",
          a: "Uruguay",
          h: "That year's hosts, a small South American nation.",
          n: "They also hosted it, beating Argentina 4-2 in the final.",
        },
      ]),
      column("lib-kick-c4", "Science & Nature", [
        {
          q: "Which gas do plants absorb from the air to carry out photosynthesis?",
          a: "Carbon dioxide",
          h: "The gas we breathe out.",
          n: "Also accept: CO2.",
        },
        {
          q: "What is the chemical symbol for gold?",
          a: "Au",
          h: "Two letters taken from the metal's Latin name.",
          n: "From the Latin 'aurum'.",
        },
        {
          q: "How many bones are in the typical adult human body?",
          a: "206",
          h: "A three-digit number just over 200; babies have around 300.",
          n: "Babies are born with around 300; many fuse together as we grow.",
        },
        {
          q: "Which gas makes up most of Earth's atmosphere?",
          a: "Nitrogen",
          h: "Not oxygen; an unreactive gas used to fill crisp packets.",
          n: "About 78%. Oxygen is only about 21%.",
          dd: true,
        },
        {
          q: "Which scale, devised in 1812, ranks minerals' hardness from talc at 1 to diamond at 10?",
          a: "Mohs scale",
          h: "Named after the German geologist who devised it.",
          n: "Named after German geologist Friedrich Mohs.",
        },
      ]),
      column("lib-kick-c5", "Tech & Inventions", [
        {
          q: "In a web address, what does 'www' stand for?",
          a: "World Wide Web",
          h: "Three words for a global network of linked pages.",
        },
        {
          q: "What does 'USB', as in a USB cable or port, stand for?",
          a: "Universal Serial Bus",
          h: "The last word is also a type of public transport.",
        },
        {
          q: "Which British scientist invented the World Wide Web in 1989 while working at CERN?",
          a: "Tim Berners-Lee",
          h: "An Oxford-educated British computer scientist, later knighted.",
        },
        {
          q: "What does 'HTTP' stand for?",
          a: "Hypertext Transfer Protocol",
          h: "Linked text, moving data, and a set of rules: in that order.",
          n: "The 'S' in HTTPS stands for Secure.",
        },
        {
          q: "Which 1993 web browser, developed at NCSA in the US, is credited with popularising the web?",
          a: "Mosaic",
          h: "Its name is also an art form made from small tiles.",
          n: "Also accept: NCSA Mosaic. Its co-creator Marc Andreessen went on to co-found Netscape.",
        },
      ]),
      column("lib-kick-c6", "Wordplay", [
        {
          q: "Finish the saying: 'Don't count your chickens before they...'",
          a: "Hatch",
          h: "What eggs do when the chicks come out.",
        },
        {
          q: "Rearrange the letters of LISTEN to make a word meaning 'without sound'.",
          a: "Silent",
          h: "Another word for quiet, using all six letters.",
          n: "LISTEN also rearranges into ENLIST, TINSEL and INLETS.",
        },
        {
          q: "Which palindromic word names a narrow boat you move with a double-bladed paddle?",
          a: "Kayak",
          h: "Think of the Inuit's traditional one-person boat.",
          n: "A palindrome reads the same backwards and forwards.",
        },
        {
          q: "Which word can follow 'basket', 'foot' and 'snow' to make three new words?",
          a: "Ball",
          h: "Something you kick, throw or bounce.",
          n: "Basketball, football, snowball.",
        },
        {
          q: "Which word means 'to decline' or 'rubbish', depending on how you pronounce it?",
          a: "Refuse",
          h: "Think of what bin collectors take away.",
          n: "re-FUSE means to decline; REF-use means rubbish. Such words are called heteronyms.",
        },
      ]),
    ],
    {
      category: "History Mysteries",
      question:
        "The Rosetta Stone, found in 1799, unlocked how to read which ancient writing system?",
      answer: "Egyptian hieroglyphs",
      notes:
        "Also accept: Hieroglyphics. Champollion announced the breakthrough in 1822; the stone also bears Demotic and Greek.",
    },
  ),
};

// ─── 5. Workplace Wellbeing & Productivity ──────────────────

const WORKPLACE_WELLBEING: LibraryTemplate = {
  id: "lib:workplace-wellbeing",
  title: "Workplace Wellbeing & Productivity",
  description:
    "A 30-question board for wellbeing weeks, productivity workshops and team resets.",
  tags: ["wellbeing", "productivity", "habits"],
  content: content(
    [
      column("lib-well-c1", "Productivity Methods", [
        {
          q: "In the classic Pomodoro Technique, how many minutes long is each focused work interval?",
          a: "25",
          h: "A bit less than half an hour.",
          n: "Named after the tomato-shaped kitchen timer its creator, Francesco Cirillo, used.",
        },
        {
          q: "The Pareto principle says roughly 80% of results come from what share of the effort?",
          a: "20%",
          h: "The rule is known by two numbers that add up to 100.",
          n: "Also called the 80/20 rule, after Italian economist Vilfredo Pareto.",
        },
        {
          q: "The Eisenhower matrix sorts tasks using which two criteria?",
          a: "Urgent and important",
          h: "How soon must it be done, and how much does it matter?",
          n: "Also accept: Urgency and importance. Popularised by Stephen Covey's 'The 7 Habits'.",
        },
        {
          q: "Which 'law' says that work expands to fill the time available for its completion?",
          a: "Parkinson's law",
          h: "Named after a British naval historian who wrote about it in 1955.",
          n: "Coined by C. Northcote Parkinson in a 1955 essay in The Economist.",
        },
        {
          q: "In David Allen's 'Getting Things Done', a task should be done at once if it takes under how many minutes?",
          a: "Two",
          h: "A single-digit number, and a very small one.",
          n: "The 'two-minute rule'. Allen's book was first published in 2001.",
        },
      ]),
      column("lib-well-c2", "Sleep & Energy", [
        {
          q: "How many hours of sleep a night do sleep experts generally recommend for adults?",
          a: "7 to 9 hours",
          h: "A range centred on a third of the day.",
          n: "Also accept: At least 7 hours.",
        },
        {
          q: "In 'REM sleep', what does the 'R' stand for?",
          a: "Rapid",
          h: "A speed word: it describes movement during this sleep stage.",
          n: "Rapid eye movement: the stage when most vivid dreaming happens.",
        },
        {
          q: "What name is given to the body's roughly 24-hour internal clock?",
          a: "Circadian rhythm",
          h: "Two words; the second is what a drummer keeps.",
          n: "Also accept: Body clock. From the Latin 'circa diem', meaning 'about a day'.",
        },
        {
          q: "Which hormone, released as it gets dark, signals the body that it is time to sleep?",
          a: "Melatonin",
          h: "Made by the pineal gland; sold as a jet-lag supplement.",
          n: "Made by the pineal gland. Bright screens late at night can suppress it.",
        },
        {
          q: "Caffeine keeps you alert by blocking receptors for which sleep-promoting brain chemical?",
          a: "Adenosine",
          h: "It builds up the longer you're awake, creating 'sleep pressure'.",
          n: "Adenosine builds up the longer you are awake, creating 'sleep pressure'.",
          dd: true,
        },
      ]),
      column("lib-well-c3", "Healthy Habits", [
        {
          q: "What daily step count has become the classic target on fitness trackers?",
          a: "10,000",
          h: "A round five-digit number.",
          n: "It traces back to a 1960s Japanese pedometer called 'manpo-kei', meaning '10,000-step meter'.",
        },
        {
          q: "Which vitamin does the skin make when exposed to sunlight?",
          a: "Vitamin D",
          h: "The 'sunshine vitamin' that helps your body absorb calcium.",
        },
        {
          q: "The '20-20-20 rule' for screen work is designed to protect what?",
          a: "Your eyes",
          h: "Think of what tires from staring at a screen all day.",
          n: "Every 20 minutes, look at something 20 feet (about 6 m) away for 20 seconds. Also accept: Eyesight.",
        },
        {
          q: "Charles Duhigg's 'habit loop' runs cue, routine and what?",
          a: "Reward",
          h: "What you get at the end that makes you want to repeat it.",
          n: "From his 2012 book 'The Power of Habit'.",
        },
        {
          q: "The WHO recommends adults get at least how many minutes of moderate aerobic activity a week?",
          a: "150",
          h: "Between two and three hours a week.",
          n: "Or at least 75 minutes of vigorous activity, or a mix of the two.",
        },
      ]),
      column("lib-well-c4", "Collaboration Etiquette", [
        {
          q: "In email, what does 'CC' stand for?",
          a: "Carbon copy",
          h: "A relic of typewriters and sheets of inked paper.",
          n: "A relic of copying letters with carbon paper. BCC is 'blind carbon copy'.",
        },
        {
          q: "Online, what does 'TL;DR' stand for?",
          a: "Too long; didn't read",
          h: "It admits the post was more than you could be bothered to get through.",
          n: "Often used to introduce a one-line summary.",
        },
        {
          q: "Jeff Bezos's rule of thumb says a team should be small enough to be fed by how many pizzas?",
          a: "Two",
          h: "A very small number: picture a small team sharing dinner.",
          n: "The 'two-pizza rule': if two pizzas can't feed the team, it's too big.",
        },
        {
          q: "When scheduling across time zones, what does UTC stand for?",
          a: "Coordinated Universal Time",
          h: "The world's reference clock, successor to GMT.",
          n: "The letters are a compromise between English (CUT) and French (TUC).",
        },
        {
          q: "Which meeting rule lets attendees use what is said, but not reveal who said it?",
          a: "Chatham House Rule",
          h: "Named after a London think tank's headquarters in St James's Square.",
          n: "Created at Chatham House in London in 1927.",
        },
      ]),
      column("lib-well-c5", "Mindfulness & Focus", [
        {
          q: "Which breathing technique uses four equal counts: breathe in, hold, breathe out, hold?",
          a: "Box breathing",
          h: "Picture tracing the four equal sides of a shape.",
          n: "Also accept: Square breathing / four-square breathing.",
        },
        {
          q: "In the 4-7-8 breathing technique, for how many seconds do you hold your breath?",
          a: "Seven",
          h: "The hold is longer than the in-breath, shorter than the out-breath.",
          n: "Breathe in for 4, hold for 7, breathe out for 8.",
        },
        {
          q: "Cal Newport's 2016 book champions which kind of focused, distraction-free work?",
          a: "Deep work",
          h: "The opposite of 'shallow' work like email and admin.",
          n: "His opposite term is 'shallow work': email, admin and the like.",
        },
        {
          q: "Psychologist Mihaly Csikszentmihalyi named which state of total absorption in a challenging task?",
          a: "Flow",
          h: "A one-word state, like a river moving smoothly.",
          n: "Also accept: Flow state / being 'in the zone'.",
        },
        {
          q: "Jon Kabat-Zinn's eight-week programme, launched in 1979, is known as MBSR. What does it stand for?",
          a: "Mindfulness-Based Stress Reduction",
          h: "Present-moment awareness used to ease pressure and worry.",
          n: "He started it at the University of Massachusetts Medical School.",
        },
      ]),
      column("lib-well-c6", "Office Life Fun Facts", [
        {
          q: "The standard English keyboard layout is named after the first six letters of its top row. What is it?",
          a: "QWERTY",
          h: "Glance at the top-left letters on your keyboard.",
          n: "Designed for typewriters in the 1870s by Christopher Latham Sholes.",
        },
        {
          q: "On most computers, what does the shortcut Ctrl + Z do?",
          a: "Undo",
          h: "Your rescue after deleting the wrong thing.",
          n: "It is Cmd + Z on a Mac.",
        },
        {
          q: "Post-it Notes rely on a weak, reusable glue discovered by accident at which company?",
          a: "3M",
          h: "A US conglomerate also famous for Scotch tape.",
          n: "Spencer Silver found the adhesive in 1968; colleague Art Fry saw its use as a bookmark.",
        },
        {
          q: "Which American inventor made the first xerographic copy, the basis of the photocopier, in 1938?",
          a: "Chester Carlson",
          h: "A patent attorney whose work led to the Xerox company.",
          n: "'Xerography' comes from the Greek for 'dry writing'.",
        },
        {
          q: "The office cubicle evolved from the 'Action Office', designed in 1968 by Robert Propst for which furniture company?",
          a: "Herman Miller",
          h: "A Michigan firm also behind the Eames lounge chair and the Aeron chair.",
          n: "Propst intended flexible workspaces, not the cramped cubicle farms that followed.",
        },
      ]),
    ],
    {
      category: "Work Science",
      question:
        "In 2019 the WHO's ICD-11 recognised which occupational phenomenon, marked by exhaustion, cynicism and reduced efficacy?",
      answer: "Burnout",
      notes:
        "Also accept: Burn-out / occupational burnout. Psychologist Herbert Freudenberger popularised the term in the 1970s.",
    },
  ),
};

export const LIBRARY_TEMPLATES: LibraryTemplate[] = [
  LEADERSHIP_ESSENTIALS,
  PEOPLE_HR,
  MENA_BUSINESS,
  TEAM_KICKOFF,
  WORKPLACE_WELLBEING,
];

// ─── Standalone columns ─────────────────────────────────────

/** Extra standalone columns for the column bank's "ICAN library" tab (not part of any template). */
export const LIBRARY_COLUMNS: TriviaColumn[] = [
  column("lib-col-negotiation", "Negotiation", [
    {
      q: "What hyphenated term describes a deal where both sides come away better off?",
      a: "Win-win",
      h: "Both sides come out on top, so the term repeats a word.",
      n: "Also accept: Mutual gain / integrative outcome.",
    },
    {
      q: "What does the negotiation acronym BATNA stand for?",
      a: "Best alternative to a negotiated agreement",
      h: "Your fallback plan if this deal falls through.",
      n: "Coined by Roger Fisher and William Ury in 'Getting to Yes' (1981).",
    },
    {
      q: "In negotiation, what does ZOPA stand for?",
      a: "Zone of possible agreement",
      h: "The overlap between what each side would settle for.",
      n: "The overlap between what each side is willing to accept.",
    },
    {
      q: "'Getting to Yes' advises negotiators to focus on interests, not on what?",
      a: "Positions",
      h: "The stated demands each side digs in on.",
      n: "Its other principles: separate the people from the problem, invent options, use objective criteria.",
    },
    {
      q: "What is the term for the least favourable deal a negotiator will accept before walking away?",
      a: "Reservation price",
      h: "The first word also means a restaurant booking.",
      n: "Also accept: Reservation point / walk-away point / resistance point.",
    },
  ]),
  column("lib-col-projects", "Project Management", [
    {
      q: "In Scrum, what is the name for a fixed-length work cycle, often two weeks long?",
      a: "Sprint",
      h: "A short race run at full speed.",
      n: "The Scrum Guide says a sprint lasts one month or less.",
    },
    {
      q: "Which bar chart, named after an American engineer, shows a project schedule against time?",
      a: "Gantt chart",
      h: "Named after Henry, who popularised it in the 1910s.",
      n: "Henry Gantt popularised it in the 1910s.",
    },
    {
      q: "In Scrum, which role is accountable for ordering the product backlog and maximising value?",
      a: "Product Owner",
      h: "Two words: what's being built, and whom it belongs to.",
      n: "The other Scrum accountabilities are the Scrum Master and the Developers.",
    },
    {
      q: "What is the longest chain of dependent tasks, which sets a project's shortest possible duration?",
      a: "Critical path",
      h: "Any delay on this route delays the whole project.",
      n: "The critical path method (CPM) was developed in the late 1950s.",
    },
    {
      q: "The Agile Manifesto was written in 2001 at a ski resort in which US state?",
      a: "Utah",
      h: "A Rocky Mountain state that hosted the 2002 Winter Olympics.",
      n: "At Snowbird, by 17 software practitioners. Also accept: Snowbird.",
    },
  ]),
  column("lib-col-economics", "Economics 101", [
    {
      q: "What is the term for a general rise in prices across an economy over time?",
      a: "Inflation",
      h: "What central banks fight by raising interest rates.",
    },
    {
      q: "What does GDP stand for?",
      a: "Gross domestic product",
      h: "The total value of all goods and services made in a country.",
    },
    {
      q: "Which Scottish economist wrote 'The Wealth of Nations', published in 1776?",
      a: "Adam Smith",
      h: "He also wrote 'The Theory of Moral Sentiments' (1759).",
      n: "The book describes the 'invisible hand' of the market.",
    },
    {
      q: "What is the term for the value of the next-best option you give up when making a choice?",
      a: "Opportunity cost",
      h: "What you sacrifice by taking one road instead of the other.",
    },
    {
      q: "A market with a single seller is a monopoly. What is a market with a single buyer called?",
      a: "Monopsony",
      h: "It sounds like monopoly; think a one-company town hiring everyone.",
      n: "A town where one employer hires almost everyone is a classic example.",
    },
  ]),
  column("lib-col-founders", "Founders & Companies", [
    {
      q: "Which company did Bill Gates co-found with Paul Allen in 1975?",
      a: "Microsoft",
      h: "Makers of Windows and Office.",
    },
    {
      q: "Steve Jobs co-founded Apple in 1976 with Ronald Wayne and which engineer?",
      a: "Steve Wozniak",
      h: "He designed the Apple I and Apple II computers.",
      n: "Also accept: Wozniak / 'Woz'.",
    },
    {
      q: "Larry Page and Sergey Brin started Google while PhD students at which university?",
      a: "Stanford",
      h: "A university in California's Silicon Valley.",
      n: "Google was incorporated in 1998.",
    },
    {
      q: "In which year did Jeff Bezos found Amazon, originally as an online bookshop?",
      a: "1994",
      h: "The mid-1990s, a year before the website went live.",
      n: "It started in a garage in Bellevue, Washington; the website launched in 1995.",
    },
    {
      q: "Toyota's car business began as a division of a company that made which machines?",
      a: "Automatic looms",
      h: "Machines from the textile industry.",
      n: "Also accept: Looms / weaving machines. The parent was Toyoda Automatic Loom Works.",
    },
  ]),
  column("lib-col-capitals", "World Capitals", [
    {
      q: "What is the capital of Japan?",
      a: "Tokyo",
      h: "Formerly known as Edo.",
    },
    {
      q: "What is the capital of Canada?",
      a: "Ottawa",
      h: "It sits on a river of the same name, across from Quebec.",
      n: "Not Toronto, the largest city.",
    },
    {
      q: "What is the capital of Australia?",
      a: "Canberra",
      h: "Not Sydney or Melbourne.",
      n: "Purpose-built as a compromise between rivals Sydney and Melbourne.",
    },
    {
      q: "What is the capital of Morocco?",
      a: "Rabat",
      h: "Not Casablanca or Marrakesh; it's on the Atlantic coast.",
      n: "Casablanca is the largest city.",
    },
    {
      q: "What is the capital of Mongolia?",
      a: "Ulaanbaatar",
      h: "Often called the coldest national capital in the world.",
      n: "Also accept: Ulan Bator.",
    },
  ]),
  column("lib-col-space", "Space & Astronomy", [
    {
      q: "Which planet is known as the Red Planet?",
      a: "Mars",
      h: "Named after the Roman god of war.",
      n: "Its colour comes from iron oxide (rust) in its dust and rocks.",
    },
    {
      q: "Who became the first human in space, in 1961?",
      a: "Yuri Gagarin",
      h: "A Soviet cosmonaut aboard Vostok 1.",
      n: "His Vostok 1 flight orbited Earth once in about 108 minutes.",
    },
    {
      q: "Roughly how long does sunlight take to reach Earth?",
      a: "About 8 minutes",
      h: "Longer than five minutes but under ten.",
      n: "Around 8 minutes 20 seconds. Accept 8 to 8.5 minutes.",
    },
    {
      q: "What was the name of the first artificial satellite, launched in 1957?",
      a: "Sputnik 1",
      h: "A Soviet satellite that beeped as it orbited.",
      n: "Also accept: Sputnik. It was launched by the Soviet Union.",
    },
    {
      q: "Which star is the closest to our Sun?",
      a: "Proxima Centauri",
      h: "A red dwarf about 4.2 light-years away.",
      n: "About 4.2 light-years away. It belongs to the Alpha Centauri star system.",
    },
  ]),
  column("lib-col-logos", "Logos & Brands", [
    {
      q: "Which sportswear brand's logo is known as the 'swoosh'?",
      a: "Nike",
      h: "Named after the Greek goddess of victory.",
      n: "A graphic design student created it in 1971 for a fee of $35.",
    },
    {
      q: "Which car brand's logo is four interlocking rings?",
      a: "Audi",
      h: "A German brand from Ingolstadt, part of the Volkswagen Group.",
      n: "The rings stand for four carmakers that merged in 1932 to form Auto Union.",
    },
    {
      q: "Which carmaker's badge shows a black prancing horse on a yellow background?",
      a: "Ferrari",
      h: "Italian supercars from Maranello.",
      n: "The yellow is the colour of Modena, Enzo Ferrari's home city.",
    },
    {
      q: "Which coffee chain's logo features a twin-tailed siren?",
      a: "Starbucks",
      h: "A coffee chain born in Seattle.",
    },
    {
      q: "Which carmaker's logo shows six stars from the Pleiades star cluster?",
      a: "Subaru",
      h: "A Japanese carmaker known for all-wheel drive and rally cars.",
      n: "'Subaru' is the Japanese name for the Pleiades.",
    },
  ]),
  column("lib-col-idioms", "Idioms & Expressions", [
    {
      q: "If something costs 'an arm and a leg', is it cheap or expensive?",
      a: "Expensive",
      h: "Think of what you'd be giving up to pay for it.",
    },
    {
      q: "Finish the saying: 'Every cloud has a silver...'",
      a: "Lining",
      h: "Inside a coat there's usually one of these.",
    },
    {
      q: "If a colleague says they are 'under the weather', how are they feeling?",
      a: "Unwell",
      h: "Think how you feel with a cold.",
      n: "Also accept: Ill / sick / a bit poorly.",
    },
    {
      q: "Which three-word theatre expression is used to wish a performer good luck?",
      a: "Break a leg",
      h: "It sounds like you're wishing them an injury.",
      n: "Saying 'good luck' backstage is traditionally considered unlucky.",
    },
    {
      q: "Which idiom for a costly possession that is more trouble than it's worth comes from a tale about Siam?",
      a: "White elephant",
      h: "Kings gave this rare, pale animal to rivals, who couldn't afford it.",
      n: "Legend says kings gave rare white elephants to rivals, who were ruined by their upkeep.",
    },
  ]),
  column("lib-col-inventors", "Inventors & Discoveries", [
    {
      q: "Who is credited with inventing the telephone, patented in 1876?",
      a: "Alexander Graham Bell",
      h: "A Scottish-born inventor who also taught deaf students.",
    },
    {
      q: "Which Scottish scientist discovered penicillin in 1928?",
      a: "Alexander Fleming",
      h: "He later shared the 1945 Nobel Prize in medicine.",
      n: "He noticed mould killing bacteria on a culture plate in his lab.",
    },
    {
      q: "Which German goldsmith developed movable-type printing in Europe around 1440?",
      a: "Johannes Gutenberg",
      h: "His famous Bible dates from the 1450s.",
      n: "Also accept: Gutenberg. His famous Bible dates from the 1450s.",
    },
    {
      q: "Which Hungarian-born journalist gave his name to the ballpoint pen he patented in 1938?",
      a: "László Bíró",
      h: "In Britain, his surname is still slang for any ballpoint.",
      n: "Also accept: Biro. In Britain a ballpoint is still often called a 'biro'.",
    },
    {
      q: "Which engineer's 1206 'Book of Knowledge of Ingenious Mechanical Devices' described clocks, pumps and automata?",
      a: "Al-Jazari",
      h: "Famous for elaborate water-powered clocks and automata.",
      n: "Also accept: Ismail al-Jazari. His elephant clock is his most famous design.",
    },
  ]),
  column("lib-col-excel", "Excel & Spreadsheets", [
    {
      q: "In a spreadsheet, which symbol do you type first to start a formula?",
      a: "Equals sign (=)",
      h: "The same symbol you'd see between two sides of a sum.",
      n: "Also accept: =.",
    },
    {
      q: "In the Excel function VLOOKUP, what does the 'V' stand for?",
      a: "Vertical",
      h: "It describes the direction it searches: down a column.",
      n: "HLOOKUP is the horizontal version; XLOOKUP is a newer, more flexible alternative.",
    },
    {
      q: "Which Excel feature summarises big tables by dragging fields into rows, columns and values?",
      a: "PivotTable",
      h: "Its name suggests rotating your data around a central point.",
      n: "Also accept: Pivot table.",
    },
    {
      q: "In a formula, what kind of cell reference is $A$1, which stays fixed when copied?",
      a: "Absolute reference",
      h: "Its counterpart, without dollar signs, is called 'relative'.",
      n: "A1 is a relative reference; $A1 and A$1 are mixed references.",
    },
    {
      q: "Which program, released for the Apple II in 1979, was the first electronic spreadsheet for personal computers?",
      a: "VisiCalc",
      h: "Created by Dan Bricklin and Bob Frankston.",
      n: "Created by Dan Bricklin and Bob Frankston. Excel arrived in 1985, first on the Mac.",
    },
  ]),
  column("lib-col-arabic", "Arabic Words in English", [
    {
      q: "Which hot drink's English name comes from the Arabic word 'qahwa'?",
      a: "Coffee",
      h: "Today you might order it as an espresso or a latte.",
      n: "It reached English via Turkish 'kahve' and Italian 'caffè'.",
    },
    {
      q: "Which branch of maths is named from 'al-jabr', meaning 'the reunion of broken parts'?",
      a: "Algebra",
      h: "Think equations and solving for x.",
      n: "From the title of al-Khwarizmi's 9th-century book on calculation.",
    },
    {
      q: "Which piece of furniture is named from the Arabic 'suffa', a raised bench or platform?",
      a: "Sofa",
      h: "Something you sit on in the living room; also called a couch.",
      n: "It reached English via Turkish and French.",
    },
    {
      q: "The Arabic 'sifr', meaning 'empty', gave English two words for nought. Name either one.",
      a: "Zero or cipher",
      h: "One is a digit; the other also means a secret code.",
      n: "Accept either. 'Cipher' meant zero long before it meant a secret code.",
    },
    {
      q: "Which English word for a periodical comes from the Arabic 'makhazin', meaning 'storehouses'?",
      a: "Magazine",
      h: "Think of the glossy publications sold at newsstands.",
      n: "Its first English sense was a storehouse, especially for ammunition.",
    },
  ]),
  column("lib-col-quotes", "Speeches & Quotes", [
    {
      q: "Finish Hamlet's famous line: 'To be, or not to be...'",
      a: "That is the question",
      h: "Hamlet is weighing up a big dilemma.",
    },
    {
      q: "Which philosopher wrote 'I think, therefore I am'?",
      a: "René Descartes",
      h: "A 17th-century French philosopher and mathematician.",
      n: "Also accept: Descartes. First in French in 1637; the Latin 'cogito, ergo sum' came later.",
    },
    {
      q: "'I came, I saw, I conquered' is attributed to which Roman leader?",
      a: "Julius Caesar",
      h: "He crossed the Rubicon in 49 BC.",
      n: "In Latin, 'Veni, vidi, vici', reportedly after a swift victory in 47 BC.",
    },
    {
      q: "Which tech founder ended his 2005 Stanford commencement speech with 'Stay hungry. Stay foolish.'?",
      a: "Steve Jobs",
      h: "Apple's co-founder, famous for black turtlenecks.",
      n: "He borrowed the words from the farewell issue of the Whole Earth Catalog.",
    },
    {
      q: "On which Apollo mission was 'Houston, we've had a problem' radioed to Mission Control?",
      a: "Apollo 13",
      h: "Between Apollo 11 and Apollo 17; the crew got home safely.",
      n: "April 1970. The 1995 film changed the line to 'Houston, we have a problem'.",
    },
  ]),
];
