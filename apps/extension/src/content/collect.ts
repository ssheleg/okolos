import type {
  CarrierKind,
  CharClass,
  ConcealmentTechnique,
  HiddenTextCandidate,
  PageCandidates,
} from '@okolos/contracts'

/**
 * The collector runs where the layout is and hands out candidates, not a
 * document. Serialising a page with its computed styles across the process
 * boundary would cost megabytes per tab and give the background context a copy
 * of everything the user reads — which is the arrangement this product exists
 * to avoid.
 */

export interface Budget {
  /** Elements to visit before giving up. */
  readonly maxNodes: number
  /** Milliseconds to spend, measured by the caller's clock. */
  readonly maxMillis: number
  /** Candidates to report from one page. */
  readonly maxCandidates: number
  /** Characters kept per candidate. */
  readonly maxTextLength: number
}

export const DEFAULT_BUDGET: Budget = {
  maxNodes: 5000,
  maxMillis: 8,
  maxCandidates: 50,
  maxTextLength: 2000,
}

export interface CollectOptions {
  readonly url: string
  readonly frameId: number
  readonly budget: Budget
  /** Milliseconds since the scan started. Injected so tests own the clock. */
  readonly elapsed: () => number
}

const ZERO_WIDTH = /[\u200B-\u200D\u2060-\u2064\uFEFF]/u
const UNICODE_TAG = /[\u{E0000}-\u{E007F}]/u
const RTL_OVERRIDE = /[\u202A-\u202E\u2066-\u2069]/u

/** Elements whose text is code or styling, not something anyone reads. */
const NOT_PROSE = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT'])

const ATTRIBUTE_CARRIERS: ReadonlyArray<{ attr: string; carrier: CarrierKind }> = [
  { attr: 'alt', carrier: 'alt' },
  { attr: 'title', carrier: 'title' },
  { attr: 'aria-label', carrier: 'aria-label' },
]

export function collect(doc: Document, options: CollectOptions): PageCandidates {
  const { budget } = options
  const candidates: HiddenTextCandidate[] = []
  let nodeCount = 0
  let truncated = false

  const outOfBudget = (): boolean =>
    nodeCount >= budget.maxNodes ||
    candidates.length >= budget.maxCandidates ||
    options.elapsed() >= budget.maxMillis

  const add = (
    text: string,
    locator: string,
    carrier: CarrierKind,
    concealment: ConcealmentTechnique[],
  ): void => {
    const trimmed = text.trim()
    if (!trimmed) return
    candidates.push({
      locator,
      text: trimmed.slice(0, budget.maxTextLength),
      concealment,
      carrier,
      charClasses: charClassesOf(trimmed),
    })
  }

  // Comments never render anywhere, which is why roughly seven in ten real
  // injections live in them and in metadata rather than behind CSS.
  const comments = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT)
  while (comments.nextNode()) {
    nodeCount += 1
    if (outOfBudget()) {
      truncated = true
      break
    }
    add(comments.currentNode.nodeValue ?? '', 'comment()', 'html-comment', ['non-rendered'])
  }

  const elements = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT)
  let current: Node | null = doc.documentElement

  while (current) {
    nodeCount += 1
    if (outOfBudget()) {
      truncated = true
      break
    }

    const element = current as Element
    const tag = element.tagName.toUpperCase()

    if (!NOT_PROSE.has(tag)) {
      for (const { attr, carrier } of ATTRIBUTE_CARRIERS) {
        const value = element.getAttribute(attr)
        if (value) add(value, locatorFor(element), carrier, ['non-rendered'])
      }
      if (tag === 'META') {
        const content = element.getAttribute('content')
        if (content) add(content, locatorFor(element), 'meta', ['non-rendered'])
      }
      for (const name of element.getAttributeNames()) {
        if (!name.startsWith('data-')) continue
        const value = element.getAttribute(name)
        if (value) add(value, locatorFor(element), 'data-attr', ['non-rendered'])
      }
    }

    if (tag === 'TEMPLATE') {
      // A template's children live in a document fragment, not in the element:
      // textContent on the element itself is empty, which is exactly why this
      // carrier is a comfortable hiding place.
      const content = (element as HTMLTemplateElement).content
      add(content.textContent ?? '', locatorFor(element), 'template', ['non-rendered'])
    } else if (tag === 'SCRIPT') {
      if (element.getAttribute('type') === 'application/ld+json') {
        add(element.textContent ?? '', locatorFor(element), 'json-ld', ['non-rendered'])
      }
    } else if (!NOT_PROSE.has(tag)) {
      const concealment = concealmentOf(element, doc)
      if (concealment.length > 0) {
        add(ownText(element), locatorFor(element), 'text-node', concealment)
      }
    }

    current = elements.nextNode()
  }

  return {
    url: stripQueryAndFragment(options.url),
    frameId: options.frameId,
    nodeCount,
    candidates,
    truncated,
  }
}

/**
 * Query strings and fragments carry session tokens and password-reset links.
 * They are removed here, in the page, before anything crosses a boundary —
 * one place, not every caller downstream.
 */
function stripQueryAndFragment(raw: string): string {
  try {
    const url = new URL(raw)
    return `${url.origin}${url.pathname}`
  } catch {
    return raw
  }
}

/** Text belonging to this element itself, not to its descendants. */
function ownText(element: Element): string {
  let text = ''
  for (const node of element.childNodes) {
    if (node.nodeType === 3) text += node.nodeValue ?? ''
  }
  return text
}

/**
 * How the text is being kept from the reader.
 *
 * Known limits, stated rather than hidden: colours are compared as computed
 * values, so text over a background image or a gradient is not caught here,
 * and a parent that clips its children is only seen through the child's own
 * computed style. Both are handled by the later stages rather than pretended
 * away.
 */
function concealmentOf(element: Element, doc: Document): ConcealmentTechnique[] {
  const view = doc.defaultView
  if (!view) return []
  const style = view.getComputedStyle(element)
  const found: ConcealmentTechnique[] = []

  if (style.display === 'none') found.push('display-none')
  if (style.visibility === 'hidden' || style.visibility === 'collapse') {
    found.push('visibility-hidden')
  }
  if (parseFloat(style.opacity || '1') === 0) found.push('opacity-zero')
  if (parseFloat(style.fontSize || '16') === 0) found.push('font-size-zero')
  if (style.clipPath === 'inset(50%)' || style.clip === 'rect(0px, 0px, 0px, 0px)') {
    found.push('clip')
  }
  if (isOffscreen(style)) found.push('offscreen')
  if (element.getAttribute('aria-hidden') === 'true') found.push('aria-hidden')
  if (sameColour(style.color, effectiveBackground(element, view))) found.push('color-on-color')

  return found
}

/**
 * Backgrounds do not inherit: an element painted white on a white parent has a
 * transparent background of its own. The classic trick is exactly that shape —
 * white text in a span inside a white div — so the ancestors have to be walked
 * to find the colour the reader actually sees behind the text.
 */
function effectiveBackground(element: Element, view: Window): string {
  let node: Element | null = element
  let depth = 0
  while (node && depth < 10) {
    const background = view.getComputedStyle(node).backgroundColor
    if (background && background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') {
      return background
    }
    node = node.parentElement
    depth += 1
  }
  return ''
}

function isOffscreen(style: CSSStyleDeclaration): boolean {
  if (style.position !== 'absolute' && style.position !== 'fixed') return false
  const left = parseFloat(style.left || '0')
  const top = parseFloat(style.top || '0')
  return left <= -1000 || top <= -1000
}

function sameColour(color: string, background: string): boolean {
  if (!color || !background) return false
  if (background === 'transparent' || background === 'rgba(0, 0, 0, 0)') return false
  return normaliseColour(color) === normaliseColour(background)
}

function normaliseColour(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

function charClassesOf(text: string): CharClass[] {
  const classes: CharClass[] = []
  if (ZERO_WIDTH.test(text)) classes.push('zero-width')
  if (UNICODE_TAG.test(text)) classes.push('unicode-tag')
  if (RTL_OVERRIDE.test(text)) classes.push('rtl-override')
  return classes
}

/** Enough to point the user at the node without shipping its contents. */
function locatorFor(element: Element): string {
  const parts: string[] = []
  let node: Element | null = element
  while (node && parts.length < 5) {
    const tag = node.tagName.toLowerCase()
    parts.unshift(node.id ? `${tag}#${node.id}` : tag)
    node = node.parentElement
  }
  return parts.join(' > ')
}
