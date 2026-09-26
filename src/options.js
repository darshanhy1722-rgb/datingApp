// Choices shared by the API (validation) and the frontend (labels), served at GET /api/options.

const GENDERS = { woman: 'Woman', man: 'Man', nonbinary: 'Non-binary' };
const INTERESTS = { woman: 'Women', man: 'Men', everyone: 'Everyone' };

const LOOKING_FOR = {
  long_term: 'Long-term relationship',
  long_term_open: 'Long-term, open to short',
  short_term_open: 'Short-term, open to long',
  short_term: 'Short-term fun',
  friends: 'New friends',
  not_sure: 'Still figuring it out',
};

const EDUCATION = {
  high_school: 'High school',
  trade: 'Trade / vocational',
  undergrad: 'Undergraduate degree',
  postgrad: 'Postgraduate degree',
};

const HABITS = { no: 'No', sometimes: 'Sometimes', yes: 'Yes' };

const KIDS = {
  want: 'Want children',
  dont_want: "Don't want children",
  have: 'Have children',
  open: 'Open to children',
  not_sure: 'Not sure yet',
};

const PROMPTS = [
  'A perfect first date',
  'My simple pleasures',
  "I'm looking for",
  'Two truths and a lie',
  'The way to win me over is',
  'My most irrational fear',
  'I geek out on',
  'Typical Sunday',
  "I'm weirdly attracted to",
  'Together, we could',
  'Green flags I look for',
  'My love language is',
  'The key to my heart is',
  "I won't shut up about",
  'Unusual skills',
  'Dating me is like',
];

// Profile details that people can also filter on.
const DETAIL_ENUMS = {
  looking_for: LOOKING_FOR,
  education: EDUCATION,
  drinking: HABITS,
  smoking: HABITS,
  kids: KIDS,
};

const REPORT_REASONS = {
  fake: 'Fake profile or scam',
  photos: 'Inappropriate photos',
  abusive: 'Offensive or abusive messages',
  underage: 'May be under 18',
  other: 'Something else',
};

// Bump this whenever terms.html or privacy.html change; everyone is asked to accept again.
const TERMS_VERSION = '2026-09-26';

const LIMITS = {
  minPhotos: 2,
  maxPhotos: 6,
  minPrompts: 1,
  maxPrompts: 3,
  minHeight: 120,
  maxHeight: 230,
  maxDistanceKm: 500,
  superSwipesPerDay: 3,
  matchExpiryHours: 24, // a new match expires if nobody sends a message in time
};

module.exports = { GENDERS, INTERESTS, LOOKING_FOR, EDUCATION, HABITS, KIDS, PROMPTS, DETAIL_ENUMS, REPORT_REASONS, TERMS_VERSION, LIMITS };
