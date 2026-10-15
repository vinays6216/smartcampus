// validate({ body: zodSchema, query: zodSchema, params: zodSchema })
// Replaces req.body / req.query / req.params with the parsed (cleaned, typed) values.
module.exports = (schemas) => (req, res, next) => {
  try {
    for (const key of ['params', 'query', 'body']) {
      if (schemas[key]) req[key] = schemas[key].parse(req[key] || {});
    }
    next();
  } catch (err) {
    next(err);
  }
};
