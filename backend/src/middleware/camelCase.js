// Converts snake_case keys of every JSON response to camelCase
// (database columns -> frontend friendly names).
const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function transform(value) {
  if (Array.isArray(value)) return value.map(transform);
  if (Object.prototype.toString.call(value) === '[object Object]') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [toCamel(k), transform(v)]));
  }
  return value;
}

module.exports = (req, res, next) => {
  const original = res.json.bind(res);
  res.json = (body) => original(transform(body));
  next();
};
