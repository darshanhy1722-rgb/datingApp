// Fills the database with demo profiles. Log in as demo@example.com / password123.
// Some demo profiles have already liked the demo user, so liking them back creates a match.
const path = require('node:path');
const { openDb } = require('../src/db');
const { hashPassword } = require('../src/auth');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'dating.db');
const db = openDb(dbPath);

const PASSWORD = 'password123';
const portrait = (kind, n) => `https://randomuser.me/api/portraits/${kind}/${n}.jpg`;

const people = [
  ['Demo', 29, 'man', 'everyone', 'Just here to try the app out.', 'Bengaluru', portrait('men', 32)],
  ['Ananya', 27, 'woman', 'man', 'Chai over coffee, mountains over beaches.', 'Bengaluru', portrait('women', 44)],
  ['Priya', 30, 'woman', 'everyone', 'Weekend baker. Ask me about sourdough.', 'Mumbai', portrait('women', 65)],
  ['Meera', 26, 'woman', 'man', 'Product designer who collects houseplants.', 'Pune', portrait('women', 12)],
  ['Sara', 31, 'woman', 'everyone', 'Marathon runner and bad-movie enthusiast.', 'Hyderabad', portrait('women', 29)],
  ['Riya', 28, 'woman', 'man', 'Trying every dosa place in the city.', 'Bengaluru', portrait('women', 50)],
  ['Arjun', 32, 'man', 'woman', 'Guitarist, trekker, amateur astronomer.', 'Chennai', portrait('men', 45)],
  ['Kabir', 29, 'man', 'everyone', 'I make a mean biryani.', 'Delhi', portrait('men', 22)],
  ['Sam', 27, 'nonbinary', 'everyone', 'Illustrator. Board games on Fridays.', 'Bengaluru', portrait('lego', 3)],
  ['Isha', 33, 'woman', 'everyone', 'Doctor by day, salsa dancer by night.', 'Kochi', portrait('women', 8)],
];

const insertUser = db.prepare(
  `INSERT OR IGNORE INTO users (email, password_hash, name, age, gender, interested_in, bio, city, photo_url)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const byEmail = db.prepare('SELECT id FROM users WHERE email = ?');
const like = db.prepare('INSERT OR IGNORE INTO swipes (swiper_id, target_id, liked) VALUES (?, ?, 1)');

const hash = hashPassword(PASSWORD);
const ids = people.map(([name, age, gender, interestedIn, bio, city, photo]) => {
  const email = `${name.toLowerCase()}@example.com`;
  insertUser.run(email, hash, name, age, gender, interestedIn, bio, city, photo);
  return byEmail.get(email).id;
});

const [demoId, ...others] = ids;
// Every other profile has liked the demo user.
others.filter((_, i) => i % 2 === 0).forEach((id) => like.run(id, demoId));

console.log(`Seeded ${people.length} profiles into ${dbPath}`);
console.log(`Log in as demo@example.com / ${PASSWORD} (every demo account uses the same password).`);
