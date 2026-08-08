import { beforeEach, describe, expect, it } from 'vitest'

import { fromCatalogue, t, useResolver, type Catalogue } from './index.js'

const CATALOGUE: Catalogue = {
  plain: { message: 'Эта страница заблокирована до загрузки' },
  withOne: {
    message: 'Помечена списком $FEED$.',
    placeholders: { feed: { content: '$1' } },
  },
  withTwo: {
    message: 'Помечена списком $FEED$$ENTRY$.',
    placeholders: { feed: { content: '$1' }, entry: { content: '$2' } },
  },
}

beforeEach(() => {
  useResolver(fromCatalogue(CATALOGUE))
})

describe('a message that exists', () => {
  it('is returned as written', () => {
    expect(t('plain')).toBe('Эта страница заблокирована до загрузки')
  })

  it('takes substitutions through named placeholders, as the platform requires', () => {
    /**
     * Not `$1` in the message. A first version did that, and Chrome refused to
     * load the extension at all — a bare `$` outside a declared placeholder is
     * a catalogue error, and a catalogue error is a dead extension, not a
     * broken string. The whole end-to-end suite failed at fixture setup.
     */
    expect(t('withOne', 'OpenPhish')).toBe('Помечена списком OpenPhish.')
    expect(t('withTwo', 'OpenPhish', ', запись от 2026-08-01')).toBe(
      'Помечена списком OpenPhish, запись от 2026-08-01.',
    )
  })

  it('leaves a placeholder alone when nothing was passed for it', () => {
    // Better a visible `$ENTRY$` than a sentence that silently loses half of
    // itself.
    expect(t('withTwo', 'OpenPhish')).toBe('Помечена списком OpenPhish$ENTRY$.')
  })
})

describe('a message that does not exist', () => {
  it('shows the key rather than nothing at all', () => {
    /**
     * The whole design decision, in one assertion. A blank string would render
     * as a warning screen with no warning on it — this product's worst failure
     * mode, and one it has already shipped twice in other forms. The key in
     * brackets is ugly on purpose: it is a bug report on the screen.
     */
    expect(t('nothingHere')).toBe('[nothingHere]')
  })

  it('shows the key before a resolver is installed at all', () => {
    // A page whose entry point forgot to install one must not go quiet.
    useResolver(fromCatalogue({}))
    expect(t('plain')).toBe('[plain]')
  })
})

describe('the resolver the host installs', () => {
  it('is used instead of any built-in lookup', () => {
    // The host is the only thing that knows which browser this is. Chrome
    // resolves through `chrome.i18n`, the tests through a plain object, and
    // this package must not care which.
    useResolver((key) => `resolved:${key}`)
    expect(t('plain')).toBe('resolved:plain')
  })

  it('receives the substitutions untouched', () => {
    let seen: readonly string[] = []
    useResolver((key, subs = []) => {
      seen = subs
      return key
    })
    t('withTwo', 'a', 'b')
    expect(seen).toEqual(['a', 'b'])
  })
})
