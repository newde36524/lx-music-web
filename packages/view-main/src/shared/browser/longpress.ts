import type { Directive } from 'svelte'

const LONGPRESS_DURATION = 500
const MOVE_TOLERANCE = 10

type ContextmenuHandler = ((event: MouseEvent) => void) | undefined

// 本项目的 Svelte 版本编译 use:longpress={fn} 时直接把 fn 传进来，不会包成数组；
// 兼容两种形式，避免以后升级时解构炸掉。
const pickHandler = (arg: ContextmenuHandler | ContextmenuHandler[]): ContextmenuHandler =>
  Array.isArray(arg) ? arg[0] : arg

/**
 * 触屏设备没有右键，长按代替右键菜单。
 *
 * 用法（和 {oncontextmenu} 绑在同一个元素上）：
 *   <div {oncontextmenu} use:longpress={oncontextmenu}>
 *
 * 长按后直接调用元素上已绑定的 oncontextmenu 处理器，
 * 所以不需要改动各组件里现有的右键菜单逻辑。
 */
export const longpress: Directive<HTMLElement, ContextmenuHandler | ContextmenuHandler[]> = (node, arg) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let start: { x: number; y: number; clientX: number; clientY: number; pageX: number; pageY: number } | undefined
  let triggered = false
  let currentHandler = pickHandler(arg)

  const clearTimer = () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1 || !currentHandler) {
      clearTimer()
      return
    }
    triggered = false
    const touch = event.touches[0]
    start = { x: touch.clientX, y: touch.clientY, clientX: touch.clientX, clientY: touch.clientY, pageX: touch.pageX, pageY: touch.pageY }
    clearTimer()
    timer = setTimeout(() => {
      timer = undefined
      if (!start) return
      const rect = node.getBoundingClientRect()
      // 元素当前不可见（比如被折叠掉）就不弹菜单
      if (rect.width <= 0 || rect.height <= 0) return
      triggered = true
      currentHandler(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX: start.clientX,
          clientY: start.clientY,
          pageX: start.pageX,
          pageY: start.pageY,
          button: 0,
          buttons: 2,
        })
      )
    }, LONGPRESS_DURATION)
  }

  const onTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (!touch || !start) return
    if (Math.abs(touch.clientX - start.x) > MOVE_TOLERANCE || Math.abs(touch.clientY - start.y) > MOVE_TOLERANCE) {
      clearTimer()
      start = undefined
    }
  }

  const onTouchEnd = (event: TouchEvent) => {
    clearTimer()
    if (triggered) {
      // 长按弹完菜单后阻止随后的 click，避免误触发点击
      triggered = false
      event.preventDefault()
    }
    start = undefined
  }

  node.addEventListener('touchstart', onTouchStart)
  node.addEventListener('touchmove', onTouchMove)
  node.addEventListener('touchend', onTouchEnd)
  node.addEventListener('touchcancel', onTouchEnd)

  return {
    update(next) {
      currentHandler = pickHandler(next)
    },
    destroy() {
      clearTimer()
      node.removeEventListener('touchstart', onTouchStart)
      node.removeEventListener('touchmove', onTouchMove)
      node.removeEventListener('touchend', onTouchEnd)
      node.removeEventListener('touchcancel', onTouchEnd)
    },
  }
}
