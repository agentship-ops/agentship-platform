// A training counts as complete when its quiz is passed and, for modules, the video is marked watched.
export function isTrainingDone(t, p) {
  return !!(p && p.passed_at && (t.is_final || p.watched_at))
}
