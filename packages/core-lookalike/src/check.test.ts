import { describe, expect, it } from 'vitest'

import { checkLookalike, editDistance } from './check.js'
import { decodePunycode, toUnicodeHost } from './punycode.js'
import { mixesScripts, skeleton } from './confusables.js'
import { DEFAULT_WATCHLIST } from './watchlist.js'

/** Latin-spelled Russian brands: a TLD test alone would miss vk.com. */
const RU_BRANDS = new Set(['vk.com', 'yandex.com'])

const WATCHLIST = ['paypal.com', 'google.com', 'microsoft.com', 'bank.test', 'sbb.ch']

describe('decoding what the address bar hides', () => {
  it('turns punycode back into the letters it stands for', () => {
    // xn--pypal-4ve.com is "pаypal.com" with a Cyrillic а.
    expect(toUnicodeHost('xn--pypal-4ve.com')).toBe('pаypal.com')
  })

  it('leaves an ordinary label alone', () => {
    expect(toUnicodeHost('paypal.com')).toBe('paypal.com')
  })

  it('decodes a well-known example correctly', () => {
    expect(decodePunycode('mnchen-3ya')).toBe('münchen')
  })

  it('refuses input that is not punycode rather than guessing', () => {
    expect(decodePunycode('!!!not-punycode!!!')).toBeNull()
  })

  it('keeps a label it cannot decode instead of dropping it', () => {
    expect(toUnicodeHost('xn--!!!.com')).toBe('xn--!!!.com')
  })
})

describe('reducing a name to what it looks like', () => {
  it('collapses Cyrillic look-alikes onto their Latin twins', () => {
    expect(skeleton('pаypаl')).toBe(skeleton('paypal'))
  })

  it('collapses rn onto m, which is what makes rnicrosoft work', () => {
    expect(skeleton('rnicrosoft')).toBe(skeleton('microsoft'))
  })

  it('collapses a zero onto an o', () => {
    expect(skeleton('g00gle')).toBe(skeleton('google'))
  })

  it('notices a label built from two alphabets', () => {
    expect(mixesScripts('pаypal')).toBe(true)
    expect(mixesScripts('paypal')).toBe(false)
  })
})

describe('the genuine article is never flagged', () => {
  it('says nothing about the watched host itself', () => {
    expect(checkLookalike('paypal.com', WATCHLIST)).toBeNull()
  })

  it('says nothing about a subdomain of it', () => {
    // A warning on accounts.google.com teaches the user to dismiss the next
    // one without reading it.
    expect(checkLookalike('accounts.google.com', WATCHLIST)).toBeNull()
  })

  it('says nothing about an unrelated site', () => {
    expect(checkLookalike('example.test', WATCHLIST)).toBeNull()
  })

  it('says nothing about a short name one edit away', () => {
    // `sbb.ch` vs `sb.ch` is one edit, but so is a third of the word.
    expect(checkLookalike('sb.ch', WATCHLIST)).toBeNull()
  })
})

describe('what it does catch', () => {
  it('a homograph written in another alphabet', () => {
    const verdict = checkLookalike('xn--pypal-4ve.com', WATCHLIST)
    expect(verdict).toMatchObject({ kind: 'mixed-script', resembles: 'paypal.com' })
  })

  it('and shows both spellings, which is the only useful thing to show', () => {
    const verdict = checkLookalike('xn--pypal-4ve.com', WATCHLIST)
    expect(verdict?.visited).toBe('xn--pypal-4ve.com')
    expect(verdict?.decoded).toContain('а')
  })

  it('a digit standing in for a letter', () => {
    expect(checkLookalike('g00gle.com', WATCHLIST)).toMatchObject({
      kind: 'homograph',
      resembles: 'google.com',
    })
  })

  it('rn for m', () => {
    expect(checkLookalike('rnicrosoft.com', WATCHLIST)).toMatchObject({ resembles: 'microsoft.com' })
  })

  it('a single typed mistake', () => {
    expect(checkLookalike('payp4l.com', WATCHLIST)).toMatchObject({ kind: 'typo', distance: 1 })
  })

  it('a swapped pair of letters', () => {
    expect(checkLookalike('gogole.com', WATCHLIST)).toMatchObject({ resembles: 'google.com' })
  })

  it('the same name under an ending one edit from the brand’s', () => {
    // `.co` and `.cm` are the classic squats on `.com`, and one edit is what
    // separates them from a different market.
    expect(checkLookalike('paypal.co', WATCHLIST)).toMatchObject({
      kind: 'tld-swap',
      resembles: 'paypal.com',
    })
    expect(checkLookalike('paypal.cm', WATCHLIST)).toMatchObject({ kind: 'tld-swap' })
    expect(checkLookalike('microsoft.co', WATCHLIST)).toMatchObject({ kind: 'tld-swap' })
  })

  it('reports the brand under an ending that is itself a word about signing in', () => {
    /**
     * The coverage recovered in B-67, and the shape of the recovery matters.
     *
     * `paypal.security` was asserted here as a swapped ending until 2026-08-20, and the
     * rule that caught it — same label, **any** different ending — reported nine genuine
     * hosts in a thirty-four-host sample: `google.de`, `yandex.com`, `github.io`,
     * `stripe.dev`, `discord.gg`, `sberbank.com`, `telegram.me`, `vk.ru`, `ozon.by`.
     * Every one is the real company on its own domain, and a warning on `google.de` is
     * how a person learns to dismiss the next one.
     *
     * Deciding by ownership needs data a content script does not have. What it does
     * have is the **meaning of the ending**: `security`, `support`, `login` are words
     * about accounts, and that is the second signal ADR-0012 asks for — the brand alone
     * is a suspicion, the brand plus "sign in here" is a verdict.
     */
    expect(checkLookalike('paypal.security', WATCHLIST)?.kind).toBe('brand-under-login-word')
    expect(checkLookalike('paypal.support', WATCHLIST)?.kind).toBe('brand-under-login-word')
    expect(checkLookalike('paypal.login', WATCHLIST)?.kind).toBe('brand-under-login-word')
    expect(checkLookalike('paypal.verify', WATCHLIST)?.kind).toBe('brand-under-login-word')
  })

  it('still says nothing about an ending that is not about accounts, and that is the cost', () => {
    /**
     * The limit that remains, stated rather than left to be discovered. A real company
     * may well own `paypal.shop`, and the false positive costs more than the miss —
     * which is the whole reason the recovery is a word list and not an ending list.
     */
    expect(checkLookalike('paypal.shop', WATCHLIST)).toBeNull()
    expect(checkLookalike('paypal.city', WATCHLIST)).toBeNull()
  })

  it('does not fire on the brand’s own ending, or on a registry suffix', () => {
    // `id` is in the word list and `.id` is Indonesia's ccTLD; a brand there is a brand
    // there. The rule needs the ending to be a single label the registrant chose, and a
    // multi-label suffix is a registry's.
    expect(checkLookalike('amazon.co.uk', WATCHLIST)).toBeNull()
    expect(checkLookalike('paypal.com', WATCHLIST)).toBeNull()
  })

  it('needs the label to be exactly the brand, not merely similar to it', () => {
    /**
     * A name that only resembles the brand is already answered by the homograph and
     * typo rules. Reading this one as "close enough" would stack two heuristics into
     * one verdict, which is how a detector starts finding what it expects.
     */
    const verdict = checkLookalike('paypa1.security', WATCHLIST)
    expect(verdict?.kind).not.toBe('brand-under-login-word')
  })

  it('a lookalike used as a subdomain of something else', () => {
    expect(checkLookalike('login.g00gle.com', WATCHLIST)).not.toBeNull()
  })
})

describe('edit distance', () => {
  it('counts a swap as one mistake, because that is what it is', () => {
    expect(editDistance('gogole', 'google')).toBe(1)
  })

  it('counts an insertion and a deletion as one each', () => {
    expect(editDistance('gooogle', 'google')).toBe(1)
    expect(editDistance('gogle', 'google')).toBe(1)
  })

  it('is zero for the same string', () => {
    expect(editDistance('paypal', 'paypal')).toBe(0)
  })
})

describe('when there is nothing to compare against', () => {
  it('says nothing on an empty watchlist', () => {
    expect(checkLookalike('g00gle.com', [])).toBeNull()
  })

  it('ignores blank entries in the watchlist', () => {
    expect(checkLookalike('g00gle.com', ['', '  ', 'google.com'])).not.toBeNull()
  })

  it('has nothing to say about an empty host', () => {
    expect(checkLookalike('   ', WATCHLIST)).toBeNull()
  })
})

describe('the brand in front of somebody else’s domain', () => {
  const WATCH = ['paypal.com', 'sberbank.ru']

  it('flags a watched name used as a subdomain of another site', () => {
    // The commonest phishing shape there is: the address bar begins with
    // "paypal.com" and the site is evil.test. The registrable domain is not
    // similar to anything watched, so every similarity check passed it.
    const verdict = checkLookalike('paypal.com.evil.test', WATCH)
    expect(verdict?.kind).toBe('brand-subdomain')
    expect(verdict?.resembles).toBe('paypal.com')
  })

  it('flags it however deep it is buried', () => {
    expect(checkLookalike('login.paypal.com.secure.evil.test', WATCH)?.kind).toBe('brand-subdomain')
  })

  it('flags the bare label too, not only the full name', () => {
    // `paypal.evil.test` shows the brand just as plainly.
    expect(checkLookalike('paypal.evil.test', WATCH)?.kind).toBe('brand-subdomain')
  })

  it('leaves the genuine site and its subdomains alone', () => {
    expect(checkLookalike('paypal.com', WATCH)).toBeNull()
    expect(checkLookalike('login.paypal.com', WATCH)).toBeNull()
  })

  it('does not fire on a label that merely contains the name', () => {
    // `mypaypal.evil.test`, not `mypaypal.test`. The shorter host has as many
    // labels as `paypal.com`, so it never reaches the brand check at all — the
    // first version of this test passed because of that early return, and went
    // on passing with the comparison loosened to a substring match. Three
    // labels get it past the guard and onto the rule it is named for.
    expect(checkLookalike('mypaypal.evil.test', WATCH)?.kind).not.toBe('brand-subdomain')
    expect(checkLookalike('paypalish.evil.test', WATCH)?.kind).not.toBe('brand-subdomain')
  })
})

describe('a hostname is not a URL', () => {
  const WATCH = ['paypal.com']

  it('does not call the genuine site with a port a lookalike of itself', () => {
    // `paypal.com:443` was read as second-level `paypal` with TLD `com:443`,
    // so the real site, visited on an explicit port, was reported as a
    // tld-swap of itself. A false alarm on the genuine article is the worst
    // kind this detector can raise.
    expect(checkLookalike('paypal.com:443', WATCH)).toBeNull()
  })

  it('reads the host past credentials, and then says nothing about it', () => {
    // `paypal.com@evil.test` resolves to evil.test: the part before the `@` is
    // a username, and the address bar shows evil.test once the navigation has
    // happened. So this detector is right to be silent — evil.test resembles
    // nothing watched.
    //
    // The first version of this test asserted the opposite, on the reasoning
    // that the brand is visible. It is, but in the *link*, before the click,
    // and that is a different detector's question. Asserting it here would
    // have made this one flag every site anyone linked to badly.
    expect(checkLookalike('paypal.com@evil.test', WATCH)).toBeNull()
    // And the brand really is gone from what is checked, rather than merely
    // failing to match.
    expect(checkLookalike('paypal.com@paypal.com.evil.test', WATCH)?.kind).toBe('brand-subdomain')
  })

  it('still refuses an empty or meaningless host', () => {
    expect(checkLookalike('..', WATCH)).toBeNull()
    expect(checkLookalike('   ', WATCH)).toBeNull()
  })
})

describe('the brands this product is actually for', () => {
  /**
   * The shipped watchlist held 29 names on 2026-08-08 and not one of them was
   * Russian — no bank, no state services portal, no marketplace — while the
   * product's own published phishing feed listed `sberbank-online-vhod.test`
   * and `gosuslugi-podtverzhdenie.test`. A lookalike check protects the names
   * it knows, so the list is a coverage claim, and this one covered PayPal and
   * DHL for an audience being phished for Sberbank.
   *
   * The attack these entries exist for is the canonical Russian one: a Latin
   * brand spelled with Cyrillic letters that render identically.
   */
  const russian = DEFAULT_WATCHLIST.filter((d) => /\.(ru|su|рф)$/.test(d) || RU_BRANDS.has(d))

  it('carries the names phished in this market', () => {
    expect(russian.length).toBeGreaterThanOrEqual(10)
  })

  it('names the two the product itself ships a feed about', () => {
    expect(DEFAULT_WATCHLIST).toContain('sberbank.ru')
    expect(DEFAULT_WATCHLIST).toContain('gosuslugi.ru')
  })

  it('catches a Cyrillic homoglyph of a bank, which is the attack', () => {
    // What `location.hostname` actually hands over for "sberbаnk.ru" with a
    // Cyrillic а: the browser punycodes it, and the check decodes it back.
    const verdict = checkLookalike('xn--sberbnk-6fg.ru', DEFAULT_WATCHLIST)
    expect(verdict, 'a Cyrillic а inside a Latin brand must not pass').not.toBeNull()
    expect(verdict?.kind).toBe('mixed-script')
    expect(verdict?.resembles).toBe('sberbank.ru')
  })

  it('catches the state services portal spelled with a Cyrillic о', () => {
    // "gоsuslugi.ru", Cyrillic о.
    const verdict = checkLookalike('xn--gsuslugi-nbh.ru', DEFAULT_WATCHLIST)
    expect(verdict?.resembles).toBe('gosuslugi.ru')
  })

  it('stays quiet on the genuine sites themselves', () => {
    // The cost of a wrong answer here is a warning on someone's own bank.
    for (const domain of ['sberbank.ru', 'gosuslugi.ru', 'ozon.ru', 'wildberries.ru', 'vk.com']) {
      expect(checkLookalike(domain, DEFAULT_WATCHLIST), domain).toBeNull()
    }
  })

  it('refuses a whole URL instead of answering about "https"', () => {
    // This function takes a hostname, and the one caller passes
    // `location.hostname`. Handed a URL it used to split on "/" and return
    // "https" — an answer to a question nobody asked, and a silent all-clear.
    expect(checkLookalike('https://xn--sberbnk-6fg.ru/login', DEFAULT_WATCHLIST)).not.toBeNull()
  })
})
