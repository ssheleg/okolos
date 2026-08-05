/**
 * The names worth impersonating.
 *
 * Shipped with the extension rather than fetched, because a lookalike check
 * that needs the network is a lookalike check that does not run on the page
 * where it matters. It is deliberately short: every entry costs a comparison on
 * every navigation, and a list of ten thousand brands would both slow the page
 * down and start flagging genuine sites that happen to be one letter apart.
 *
 * These are the targets that appear in phishing corpora year after year. A
 * user's own frequently-visited sites are added on top at runtime; that list is
 * theirs and never leaves the device.
 */
export const DEFAULT_WATCHLIST: readonly string[] = [
  'google.com',
  'youtube.com',
  'facebook.com',
  'instagram.com',
  'whatsapp.com',
  'apple.com',
  'icloud.com',
  'microsoft.com',
  'outlook.com',
  'office.com',
  'amazon.com',
  'netflix.com',
  'paypal.com',
  'stripe.com',
  'coinbase.com',
  'binance.com',
  'metamask.io',
  'github.com',
  'gitlab.com',
  'linkedin.com',
  'dropbox.com',
  'adobe.com',
  'steamcommunity.com',
  'discord.com',
  'telegram.org',
  'booking.com',
  'dhl.com',
  'fedex.com',
  'ups.com',
]
