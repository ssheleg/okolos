import { describe, expect, it } from 'vitest'

import { isFramed } from './framed.js'

describe('the block page knows whether it is the page', () => {
  it('is not framed when it is its own top', () => {
    const win = {} as Pick<Window, 'top' | 'self'>
    Object.assign(win, { top: win, self: win })
    expect(isFramed({ win })).toBe(false)
  })

  it('is framed when the top is somebody else', () => {
    const self = {} as Window
    const win = { top: {} as Window, self } as Pick<Window, 'top' | 'self'>
    expect(isFramed({ win })).toBe(true)
  })

  /**
   * A cross-origin parent can make the `top` access throw rather than hand over a foreign
   * window. Reading that as "not framed" would be the wrong direction: only a framed
   * document can be denied its own top.
   */
  it('reads a refused access as framed, not as safe', () => {
    const win = {
      get top(): Window {
        throw new DOMException('blocked a frame from accessing a cross-origin frame')
      },
      self: {} as Window,
    } as Pick<Window, 'top' | 'self'>
    expect(isFramed({ win })).toBe(true)
  })
})
