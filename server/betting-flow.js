function resolveAllInShowdown(engine, done) {
  if (!done || done.reason !== 'all_in_showdown') return false;
  engine.dealRemainingCardsToShowdown();
  return true;
}

module.exports = {
  resolveAllInShowdown,
};
