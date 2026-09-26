// Fills the database with demo profiles. Log in as demo@example.com / password123.
// Some demo profiles have already liked the demo user (one with a SuperSwipe), and the demo
// user already has matches in each state: new with the 24h timer running, chatting, and expired.
const path = require('node:path');
const { openDb, transaction } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { DEFAULT_FILTERS } = require('../src/profile');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'dating.db');
const db = openDb(dbPath);

const PASSWORD = 'password123';
const pic = (kind, n) => `https://randomuser.me/api/portraits/${kind}/${n}.jpg`;

function birthdate(age) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age, 0, 15);
  return d.toISOString().slice(0, 10);
}

// [name, age, gender, interested_in, area, lat, lon, details, photos, prompts, likesDemo]
const people = [
  ['Demo', 29, 'man', 'woman', 'Koramangala, Bengaluru', 12.935, 77.624,
    { height_cm: 178, job_title: 'Software engineer', education: 'undergrad', looking_for: 'long_term', drinking: 'sometimes', smoking: 'no', kids: 'open', hometown: 'Mysuru' },
    [pic('men', 32), pic('men', 33)],
    [['A perfect first date', 'Filter coffee, a walk in Cubbon Park, then dosa.'], ['I geek out on', 'Mechanical keyboards and old Bollywood songs.']]],
  ['Ananya', 27, 'woman', 'man', 'Indiranagar, Bengaluru', 12.978, 77.641,
    { height_cm: 163, job_title: 'Product designer', education: 'postgrad', looking_for: 'long_term', drinking: 'sometimes', smoking: 'no', kids: 'want', bio: 'Chai over coffee, mountains over beaches.', hometown: 'Guwahati' },
    [pic('women', 44), pic('women', 45), pic('women', 46)],
    [['Typical Sunday', 'Farmers market, a long brunch, then a nap I refuse to apologise for.'], ['Green flags I look for', 'You text back and you tip well.'], ['Two truths and a lie', "I've met a tiger, I speak four languages, I hate mangoes."]],
    true],
  ['Priya', 30, 'woman', 'everyone', 'HSR Layout, Bengaluru', 12.912, 77.638,
    { height_cm: 168, job_title: 'Pastry chef', education: 'trade', looking_for: 'long_term_open', drinking: 'yes', smoking: 'no', kids: 'not_sure', bio: 'Weekend baker. Ask me about sourdough.' },
    [pic('women', 65), pic('women', 66)],
    [['The way to win me over is', 'Bring me a croissant and an honest opinion.'], ['My simple pleasures', 'Warm bread, rain, and a good playlist.']]],
  ['Meera', 26, 'woman', 'man', 'Jayanagar, Bengaluru', 12.925, 77.583,
    { height_cm: 158, job_title: 'Architect', education: 'undergrad', looking_for: 'long_term', drinking: 'no', smoking: 'no', kids: 'want' },
    [pic('women', 12), pic('women', 13)],
    [["I won't shut up about", 'Old buildings and the stories behind them.'], ['Together, we could', 'Find the best filter coffee in the city. Scientifically.']],
    true],
  ['Sara', 31, 'woman', 'everyone', 'Whitefield, Bengaluru', 12.970, 77.750,
    { height_cm: 172, job_title: 'Data scientist', education: 'postgrad', looking_for: 'short_term_open', drinking: 'sometimes', smoking: 'sometimes', kids: 'dont_want', bio: 'Marathon runner and bad-movie enthusiast.' },
    [pic('women', 29), pic('women', 30)],
    [['My most irrational fear', 'Geese. Absolutely not.'], ['Dating me is like', 'Signing up for a 10k you didn\'t train for, but fun.']]],
  ['Riya', 28, 'woman', 'man', 'Malleshwaram, Bengaluru', 13.003, 77.570,
    { height_cm: 160, job_title: 'Doctor', education: 'postgrad', looking_for: 'long_term', drinking: 'no', smoking: 'no', kids: 'want' },
    [pic('women', 50), pic('women', 51)],
    [['A perfect first date', 'Trying every dosa place on one street and ranking them.'], ['My love language is', 'Food. Always food.']],
    true],
  ['Isha', 33, 'woman', 'everyone', 'Bandra, Mumbai', 19.060, 72.836,
    { height_cm: 165, job_title: 'Lawyer', education: 'postgrad', looking_for: 'long_term', drinking: 'sometimes', smoking: 'no', kids: 'open', bio: 'Salsa dancer by night.' },
    [pic('women', 8), pic('women', 9)],
    [['Unusual skills', 'I can argue both sides of anything. Ask me.'], ['The key to my heart is', 'A spontaneous road trip playlist.']],
    true],
  ['Kavya', 24, 'woman', 'man', 'Electronic City, Bengaluru', 12.845, 77.660,
    { height_cm: 155, job_title: 'Student', education: 'undergrad', looking_for: 'not_sure', drinking: 'no', smoking: 'no', kids: 'not_sure' },
    [pic('women', 21), pic('women', 22)],
    [["I'm weirdly attracted to", 'People who can parallel park on the first try.']]],
  ['Arjun', 32, 'man', 'woman', 'Adyar, Chennai', 13.006, 80.257,
    { height_cm: 182, job_title: 'Musician', education: 'undergrad', looking_for: 'long_term', drinking: 'sometimes', smoking: 'no', kids: 'want' },
    [pic('men', 45), pic('men', 46)],
    [['I geek out on', 'Telescopes and Carnatic music.']]],
  // Already matched with the demo user (see MATCHES below).
  ['Tanvi', 26, 'woman', 'man', 'BTM Layout, Bengaluru', 12.916, 77.610,
    { height_cm: 161, job_title: 'UX researcher', education: 'postgrad', looking_for: 'long_term', drinking: 'sometimes', smoking: 'no', hometown: 'Mysuru' },
    [pic('women', 33), pic('women', 34)],
    [['My simple pleasures', 'Rain, pakoras, and a window seat.']]],
  ['Divya', 28, 'woman', 'man', 'Hebbal, Bengaluru', 13.035, 77.597,
    { height_cm: 166, job_title: 'Chartered accountant', education: 'postgrad', looking_for: 'long_term_open', drinking: 'no', smoking: 'no' },
    [pic('women', 57), pic('women', 58)],
    [['Two truths and a lie', "I've run a marathon, I can juggle, I hate chocolate."]]],
  ['Pooja', 29, 'woman', 'man', 'Marathahalli, Bengaluru', 12.956, 77.701,
    { height_cm: 159, job_title: 'Teacher', education: 'undergrad', looking_for: 'not_sure' },
    [pic('women', 71), pic('women', 72)],
    [['Typical Sunday', 'Long walks and longer phone calls with my mom.']]],
  ['Sam', 27, 'nonbinary', 'everyone', 'Indiranagar, Bengaluru', 12.972, 77.640,
    { height_cm: 170, job_title: 'Illustrator', education: 'undergrad', looking_for: 'friends', drinking: 'sometimes', smoking: 'no', kids: 'dont_want' },
    [pic('lego', 3), pic('lego', 4)],
    [['Typical Sunday', 'Board games, too many snacks, zero plans.']]],
];

const insertUser = db.prepare(
  `INSERT INTO users (email, password_hash, name, birthdate, gender, interested_in, city, latitude, longitude,
                      height_cm, job_title, education, looking_for, drinking, smoking, kids, bio, hometown, filters)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insertSwipe = db.prepare('INSERT OR IGNORE INTO swipes (swiper_id, target_id, liked) VALUES (?, ?, 1)');
const insertMatch = db.prepare("INSERT OR IGNORE INTO matches (user_a, user_b, created_at) VALUES (?, ?, datetime('now', ?))");
const matchId = db.prepare('SELECT id FROM matches WHERE user_a = ? AND user_b = ?');
const insertMessage = db.prepare("INSERT INTO messages (match_id, sender_id, body, created_at) VALUES (?, ?, ?, datetime('now', ?))");
const makeSuper = db.prepare('UPDATE swipes SET super = 1 WHERE swiper_id = ? AND target_id = ?');

// The demo user's existing matches: [name, matched how long ago, messages [fromDemo, text, how long ago]].
const MATCHES = [
  ['Tanvi', '-5 hours', []],
  ['Divya', '-2 days', [[false, 'Hey! Saw you like filter coffee too ☕', '-1 day'], [true, 'Guilty. Where do you usually go?', '-20 hours'], [false, 'What are you doing this weekend?', '-3 hours']]],
  ['Pooja', '-3 days', []],
];
const insertPhoto = db.prepare('INSERT INTO photos (user_id, url) VALUES (?, ?)');
const insertPrompt = db.prepare('INSERT INTO prompts (user_id, position, prompt, answer) VALUES (?, ?, ?, ?)');
const like = db.prepare('INSERT OR IGNORE INTO swipes (swiper_id, target_id, liked, comment, liked_item) VALUES (?, ?, 1, ?, ?)');
const photosOf = db.prepare('SELECT id FROM photos WHERE user_id = ? ORDER BY id');
const byEmail = db.prepare('SELECT id FROM users WHERE email = ?');

const hash = hashPassword(PASSWORD);
// What each like was on: the demo user's photos and prompts, Hinge-style.
const likeNotes = [
  { comment: 'Your first-date idea sounds perfect 😄', item: (demo) => ({ type: 'prompt', prompt: demo.prompts[0] }) },
  { comment: '', item: (demo) => ({ type: 'photo', photo_id: demo.photoIds[1] }) },
  { comment: 'Okay but which keyboard switches?', item: (demo) => ({ type: 'prompt', prompt: demo.prompts[1] }) },
  { comment: 'Great smile!', item: (demo) => ({ type: 'photo', photo_id: demo.photoIds[0] }) },
];

transaction(db, () => {
  let demo;
  let likeIndex = 0;
  for (const [name, age, gender, interestedIn, city, lat, lon, d, photos, prompts, likesDemo] of people) {
    const email = `${name.toLowerCase()}@example.com`;
    if (byEmail.get(email)) continue;
    const { lastInsertRowid: id } = insertUser.run(
      email, hash, name, birthdate(age), gender, interestedIn, city, lat, lon,
      d.height_cm ?? null, d.job_title ?? '', d.education ?? null, d.looking_for ?? null,
      d.drinking ?? null, d.smoking ?? null, d.kids ?? null, d.bio ?? '', d.hometown ?? '', JSON.stringify(DEFAULT_FILTERS),
    );
    photos.forEach((url) => insertPhoto.run(id, url));
    prompts.forEach(([prompt, answer], i) => insertPrompt.run(id, i, prompt, answer));
    if (name === 'Demo') {
      demo = { id, photoIds: photosOf.all(id).map((p) => p.id), prompts: prompts.map(([prompt]) => prompt) };
    } else if (likesDemo && demo) {
      const note = likeNotes[likeIndex++ % likeNotes.length];
      like.run(id, demo.id, note.comment, JSON.stringify(note.item(demo)));
    }
  }
  if (!demo) return; // already seeded

  // Isha's like is a SuperSwipe, so she's first in Liked You.
  makeSuper.run(byEmail.get('isha@example.com').id, demo.id);

  for (const [name, ago, messages] of MATCHES) {
    const other = byEmail.get(`${name.toLowerCase()}@example.com`).id;
    insertSwipe.run(demo.id, other);
    insertSwipe.run(other, demo.id);
    const [a, b] = demo.id < other ? [demo.id, other] : [other, demo.id];
    insertMatch.run(a, b, ago);
    const { id } = matchId.get(a, b);
    for (const [fromDemo, body, when] of messages) insertMessage.run(id, fromDemo ? demo.id : other, body, when);
  }
});

console.log(`Seeded ${people.length} profiles into ${dbPath}`);
console.log(`Log in as demo@example.com / ${PASSWORD} (every demo account uses the same password).`);
