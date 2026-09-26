const { GENDERS, INTERESTS, DETAIL_ENUMS, LIMITS } = require('./options');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function ageFrom(birthdate, now = new Date()) {
  const [y, m, d] = birthdate.split('-').map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

function validateBirthdate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, 'Date of birth must be a date (YYYY-MM-DD)');
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, 'Date of birth is not a real date');
  }
  const age = ageFrom(value);
  if (age < 18) throw new HttpError(400, 'You must be 18 or older to join');
  if (age > 100) throw new HttpError(400, 'Please check your date of birth');
  return value;
}

// Great-circle distance in km.
function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function text(value, field, maxLen) {
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`);
  const s = value.trim();
  if (s.length > maxLen) throw new HttpError(400, `${field} must be at most ${maxLen} characters`);
  return s;
}

function int(value, field, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${field} must be a whole number from ${min} to ${max}`);
  }
  return n;
}

function oneOf(value, field, choices) {
  if (!Object.hasOwn(choices, value)) {
    throw new HttpError(400, `${field} must be one of: ${Object.keys(choices).join(', ')}`);
  }
  return value;
}

const isBlank = (v) => v === null || v === '';

// Validates editable profile fields; only fields present in `body` are returned.
function validateDetails(body) {
  const out = {};
  const has = (k) => body[k] !== undefined;

  if (has('name')) {
    out.name = text(body.name, 'name', 50);
    if (!out.name) throw new HttpError(400, 'Name is required');
  }
  if (has('gender')) out.gender = oneOf(body.gender, 'gender', GENDERS);
  if (has('interested_in')) out.interested_in = oneOf(body.interested_in, 'interested_in', INTERESTS);
  if (has('bio')) out.bio = text(body.bio, 'bio', 500);
  if (has('city')) out.city = text(body.city, 'city', 80);
  if (has('hometown')) out.hometown = text(body.hometown, 'hometown', 80);
  if (has('job_title')) out.job_title = text(body.job_title, 'job_title', 60);
  if (has('height_cm')) {
    out.height_cm = isBlank(body.height_cm)
      ? null
      : int(body.height_cm, 'height_cm', LIMITS.minHeight, LIMITS.maxHeight);
  }
  for (const [field, choices] of Object.entries(DETAIL_ENUMS)) {
    if (has(field)) out[field] = isBlank(body[field]) ? null : oneOf(body[field], field, choices);
  }
  if (has('latitude') || has('longitude')) {
    if (isBlank(body.latitude) && isBlank(body.longitude)) {
      out.latitude = null;
      out.longitude = null;
    } else {
      const lat = Number(body.latitude);
      const lon = Number(body.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        throw new HttpError(400, 'latitude and longitude must be valid coordinates');
      }
      // ~100 m precision is plenty for distance and avoids storing an exact address.
      out.latitude = Math.round(lat * 1000) / 1000;
      out.longitude = Math.round(lon * 1000) / 1000;
    }
  }
  return out;
}

const DEFAULT_FILTERS = Object.freeze({
  min_age: 18,
  max_age: 99,
  max_distance_km: null,
  min_height_cm: null,
  max_height_cm: null,
  ...Object.fromEntries(Object.keys(DETAIL_ENUMS).map((k) => [k, []])),
});

// Validates a filters object, filling in defaults for anything missing.
function normalizeFilters(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new HttpError(400, 'filters must be an object');
  }
  const f = { ...DEFAULT_FILTERS, ...input };
  const out = {
    min_age: int(f.min_age, 'min_age', 18, 99),
    max_age: int(f.max_age, 'max_age', 18, 99),
    max_distance_km: isBlank(f.max_distance_km) ? null : int(f.max_distance_km, 'max_distance_km', 1, LIMITS.maxDistanceKm),
    min_height_cm: isBlank(f.min_height_cm) ? null : int(f.min_height_cm, 'min_height_cm', LIMITS.minHeight, LIMITS.maxHeight),
    max_height_cm: isBlank(f.max_height_cm) ? null : int(f.max_height_cm, 'max_height_cm', LIMITS.minHeight, LIMITS.maxHeight),
  };
  if (out.min_age > out.max_age) throw new HttpError(400, 'Minimum age must not be above maximum age');
  if (out.min_height_cm !== null && out.max_height_cm !== null && out.min_height_cm > out.max_height_cm) {
    throw new HttpError(400, 'Minimum height must not be above maximum height');
  }
  for (const [field, choices] of Object.entries(DETAIL_ENUMS)) {
    if (!Array.isArray(f[field])) throw new HttpError(400, `${field} filter must be a list`);
    out[field] = [...new Set(f[field].map((v) => oneOf(v, `${field} filter`, choices)))];
  }
  return out;
}

function parseFilters(json) {
  try {
    return { ...DEFAULT_FILTERS, ...JSON.parse(json) };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

// Whether `candidate` should appear in `me`'s feed, given both people's filters.
// Gender/interest compatibility is handled in SQL; this covers everything else.
// Returns the distance in km (or null if unknown) when they pass, otherwise false.
function passesFilters(me, myFilters, candidate, theirFilters) {
  const myAge = ageFrom(me.birthdate);
  const theirAge = ageFrom(candidate.birthdate);
  if (theirAge < myFilters.min_age || theirAge > myFilters.max_age) return false;
  if (myAge < theirFilters.min_age || myAge > theirFilters.max_age) return false;

  let distance = null;
  if (me.latitude !== null && candidate.latitude !== null) {
    distance = distanceKm(me.latitude, me.longitude, candidate.latitude, candidate.longitude);
  }
  if (myFilters.max_distance_km !== null && (distance === null || distance > myFilters.max_distance_km)) return false;

  const h = candidate.height_cm;
  if (myFilters.min_height_cm !== null && (h === null || h < myFilters.min_height_cm)) return false;
  if (myFilters.max_height_cm !== null && (h === null || h > myFilters.max_height_cm)) return false;

  for (const field of Object.keys(DETAIL_ENUMS)) {
    const wanted = myFilters[field];
    if (wanted.length && !wanted.includes(candidate[field])) return false;
  }
  return { distance };
}

module.exports = {
  HttpError,
  ageFrom,
  validateBirthdate,
  distanceKm,
  text,
  int,
  validateDetails,
  normalizeFilters,
  parseFilters,
  passesFilters,
  DEFAULT_FILTERS,
};
