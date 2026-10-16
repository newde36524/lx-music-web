import { setAsideDrawer } from '@/modules/app/store/action'
import { appState } from '@/modules/app/store/state'

import { isMobileViewport } from './mobile'

/** 从左边距起多少像素内起手，才把向右滑当成「唤出抽屉」 */
const EDGE_ZONE = 28
/** 横向滑动超过多少像素才触发 */
const TRIGGER_DISTANCE = 40
/** 横向位移至少要超过纵向位移的几倍，避免打断页面纵向滚动 */
const HORIZONTAL_DOMINANCE = 1.5

// 自己处理手势或会误触的区域：顶栏、播放栏、进度条、表格、表单控件
const IGNORE_SELECTOR = '.header, .player, .middle-play-progress, .mini-play-progress, table, input, textarea, button, select'
const MODAL_SELECTOR = '#root.show-modal, #root.show-fullscreen-modal'

/**
 * 移动端抽屉的左右滑动手势：
 * - 抽屉收起时，从左边距起手向右滑 → 唤出
 * - 抽屉展开时，任意位置向左滑 → 收起
 *
 * 只在横滑明显主导时才触发，纵向滚动不受影响。
 */
export const initAsideSwipe = (): (() => void) => {
  let start: { x: number; y: number } | undefined
  let fired = false
  let suppressClickUntil = 0

  const onTouchStart = (event: TouchEvent) => {
    if (!isMobileViewport() || event.touches.length > 1) return
    if (document.querySelector(MODAL_SELECTOR)) return
    const touch = event.touches[0]
    if (!touch) return
    // 收起时任意位置起手都能向左滑收起；展开时只认左边距起手，避免和普通滑动冲突
    if (touch.clientX > EDGE_ZONE && !appState.isAsideDrawerOpen) return
    if ((touch.target as Element | null)?.closest(IGNORE_SELECTOR)) return
    start = { x: touch.clientX, y: touch.clientY }
    fired = false
  }

  const onTouchMove = (event: TouchEvent) => {
    if (fired || !start) return
    const touch = event.touches[0]
    if (!touch) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < TRIGGER_DISTANCE || Math.abs(dx) < Math.abs(dy) * HORIZONTAL_DOMINANCE) return

    if (dx > 0 && !appState.isAsideDrawerOpen) setAsideDrawer(true)
    else if (dx < 0 && appState.isAsideDrawerOpen) setAsideDrawer(false)

    fired = true
    start = undefined
    // 手势已经接管，吞掉随后产生的 click，避免点中别的控件
    suppressClickUntil = Date.now() + 350
  }

  const onTouchEnd = () => {
    start = undefined
    fired = false
  }

  const onClickCapture = (event: MouseEvent) => {
    if (Date.now() > suppressClickUntil) return
    suppressClickUntil = 0
    event.stopPropagation()
    event.preventDefault()
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchmove', onTouchMove, { passive: true })
  document.addEventListener('touchend', onTouchEnd)
  document.addEventListener('touchcancel', onTouchEnd)
  document.addEventListener('click', onClickCapture, true)
  return () => {
    document.removeEventListener('touchstart', onTouchStart)
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('touchend', onTouchEnd)
    document.removeEventListener('touchcancel', onTouchEnd)
    document.removeEventListener('click', onClickCapture, true)
  }
}
