// Single source of truth for password requirements.
//
// These MUST match what's configured in Supabase under
// Authentication → Sign In / Providers → Email. If you change the rules there,
// change them here too — otherwise the app promises one thing and the server
// enforces another, which is what made a valid-looking password get rejected.
//
// Currently configured in Supabase: minimum 10 characters, requires lowercase,
// uppercase, digits and symbols.

export const MIN_LENGTH = 10

// The symbol set Supabase accepts, per their docs.
export const ALLOWED_SYMBOLS = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~'

export const RULES = [
  {
    id: 'length',
    label: `At least ${MIN_LENGTH} characters`,
    test: p => p.length >= MIN_LENGTH,
  },
  {
    id: 'lower',
    label: 'A lowercase letter',
    test: p => /[a-z]/.test(p),
  },
  {
    id: 'upper',
    label: 'An uppercase letter',
    test: p => /[A-Z]/.test(p),
  },
  {
    id: 'digit',
    label: 'A number',
    test: p => /[0-9]/.test(p),
  },
  {
    id: 'symbol',
    label: 'A symbol, like ! @ # $ or %',
    test: p => /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/.test(p),
  },
]

// Which requirements a given password does not yet meet.
export function unmetRules(password) {
  return RULES.filter(r => !r.test(password || ''))
}

export function isValidPassword(password) {
  return unmetRules(password).length === 0
}

// One-line summary for helper text.
export const SUMMARY =
  `${MIN_LENGTH}+ characters with an uppercase letter, a lowercase letter, a number, and a symbol.`
