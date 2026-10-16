import { windowSizeList } from '@any-listen/common/constants'
import { debounce } from '@any-listen/common/utils'

import { isMobileViewport, isTouchDevice } from '@/shared/browser/mobile'
import { setFullScreen, setRootOffset } from '@/modules/app/store/action'
import { appState } from '@/modules/app/store/state'
import { settingState } from '@/modules/setting/store/state'
import { getItem, LOCAL_STORE_KEYS, setItem } from '@/shared/localStore'

interface WindowInfo {
  offsetX: number
  offsetY: number
  isMaximized: boolean
}
const DEFAULT_OFFSET = 8
const getWindowInfo = (): WindowInfo => {
  let info = getItem(LOCAL_STORE_KEYS.windowInfo)
  if (info) {
    try {
      const parsed = JSON.parse(info) as WindowInfo
      parsed.offsetX ||= DEFAULT_OFFSET
      parsed.offsetY ||= DEFAULT_OFFSET
      parsed.isMaximized ||= false
      return parsed
    } catch {}
  }
  return {
    offsetX: DEFAULT_OFFSET,
    offsetY: DEFAULT_OFFSET,
    isMaximized: false,
  }
}
const saveWindowInfo = (params: WindowInfo) => {
  setItem(LOCAL_STORE_KEYS.windowInfo, JSON.stringify(params))
}
const saveWindowInfoDebounce = debounce(saveWindowInfo, 100)
const resetWindow = () => {
  document.body.style.removeProperty('position')
  document.body.style.removeProperty('width')
  document.body.style.removeProperty('height')
  document.body.style.removeProperty('left')
  document.body.style.removeProperty('top')
}

/**
 * 把「假窗口」位置钳制在视口内。
 *
 * 假窗口模式只在视口放得下整个窗口时才启用，所以这里可以直接限制在视口内（留一格外边距），
 * 不需要预留「屏外露一点便于拖回」的余量。
 *
 * 原来只挡左边和上边，窗口能整个被拖到右侧/下侧之外；还原位置时也不做任何校验，
 * localStorage 里一旦存了屏外的值，页面上就没有可抓的边，再也拖不回来。
 */
const clampOffset = (x: number, y: number, w: number, h: number) => ({
  x: Math.max(Math.min(x, window.innerWidth - w - VIEWPORT_PADDING), VIEWPORT_PADDING),
  y: Math.max(Math.min(y, window.innerHeight - h - VIEWPORT_PADDING), VIEWPORT_PADDING),
})
/** `html.web:not(.fullscreen)` 的外边距，假窗口两侧各占一份 */
const VIEWPORT_PADDING = 8
/** 拖动中的标记，避免拖动到一半被 resize 处理改成别的布局 */
let dragging = false
/** 用户主动点的全屏/还原；移动端和「视口放不下窗口」的自动铺满都不算 */
let userFullscreen = false
let currentMode: 'fill' | 'fake' | undefined

const getTargetSize = (): { width: number; height: number } =>
  windowSizeList.find((w) => w.id == settingState.setting['common.windowSizeId']) || {
    width: 1020,
    height: 670,
  }

/** 视口是否放得下当前配置的桌面窗口（含两侧外边距） */
const canFitFakeWindow = () => {
  const { width, height } = getTargetSize()
  return window.innerWidth >= width + VIEWPORT_PADDING * 2 && window.innerHeight >= height + VIEWPORT_PADDING * 2
}

const applyFill = () => {
  setFullScreen(true)
  setRootOffset(0, 0)
  resetWindow()
}

const applyFakeWindow = () => {
  const info = getWindowInfo()
  const { width, height } = getTargetSize()
  // 还原时也要钳制：localStorage 里可能存着屏幕外的旧值
  const { x, y } = clampOffset(info.offsetX, info.offsetY, width, height)
  setFullScreen(false)
  setRootOffset(x, y)
  document.body.style.position = 'absolute'
  document.body.style.width = `${width}px`
  document.body.style.height = `${height}px`
  document.body.style.left = `${x}px`
  document.body.style.top = `${y}px`
}

/**
 * 按视口宽度决定布局：
 * - 手机端 / 用户主动全屏 / 视口放不下桌面窗口 → 铺满视口
 * - 其余 → 源码原本的可拖动「假窗口」
 *
 * 已经是目标布局时直接返回，避免和窗口拖动、尺寸变更互相打架。
 */
const applyLayout = (force = false) => {
  const mode = isMobileViewport() || userFullscreen || !canFitFakeWindow() ? 'fill' : 'fake'
  if (!force && mode === currentMode) return
  currentMode = mode
  if (mode == 'fill') applyFill()
  else applyFakeWindow()
}

export const initWindowInfo = () => {
  userFullscreen = getWindowInfo().isMaximized
  applyLayout()
}

export const setMaximized = (maximized: boolean) => {
  if (isMobileViewport()) return
  userFullscreen = maximized
  applyLayout(true)
  const info = getWindowInfo()
  info.isMaximized = maximized
  saveWindowInfo(info)
}

export const handleRelease = () => {
  resetWindow()
}

export const handleConfigChange = (keys: Array<keyof AnyListen.AppSetting>, setting: Partial<AnyListen.AppSetting>) => {
  if (isMobileViewport()) return
  if (keys.includes('common.windowSizeId') && windowSizeList.some((w) => w.id == setting['common.windowSizeId'])) {
    // 换窗口尺寸后可能从「放不下」变成「放得下」，重新决策一次
    applyLayout(true)
  }
}

/**
 * 窗口尺寸变化可能跨过「放得下桌面窗口」这条线，重新决策。
 * 只在上/下切换时生效，拖动窗口时不处理。
 */
export const initLayoutResizeHandler = (): (() => void) => {
  const handleResize = debounce(() => {
    if (dragging) return
    applyLayout()
  }, 150)
  window.addEventListener('resize', handleResize)
  return () => window.removeEventListener('resize', handleResize)
}

// 是否忽略事件（表单元素等默认忽略）
const assertIgnoreEl = (element: HTMLElement) => {
  // stop for input, select, and textarea
  switch (element.tagName) {
    case 'INPUT':
    case 'SELECT':
    case 'BUTTON':
    case 'TEXTAREA':
      return true
    default:
      return !!element.isContentEditable
  }
}
const checkIgnoreEl = (element: HTMLElement | null): boolean => {
  if (!element) return false
  if (assertIgnoreEl(element)) return true
  return checkIgnoreEl(element.parentElement)
}

const windowMaximize = (dom: HTMLElement) => {
  const handleDblClick = (evt: MouseEvent) => {
    if (checkIgnoreEl(evt.target as HTMLElement)) return
    setMaximized(!appState.isFullscreen)
  }
  dom.addEventListener('dblclick', handleDblClick)
  return () => {
    dom.removeEventListener('dblclick', handleDblClick)
  }
}

export const windowDarg = (dom: HTMLElement) => {
  const msEvent = {
    isMsDown: false,
    msDownX: 0,
    msDownY: 0,
    winY: 0,
    winX: 0,
  }
  const handleMove = (clientX: number, clientY: number) => {
    if (!msEvent.isMsDown) return
    const { x, y } = clampOffset(
      msEvent.winX + clientX - msEvent.msDownX,
      msEvent.winY + clientY - msEvent.msDownY,
      document.body.clientWidth || 1020,
      document.body.clientHeight || 670
    )
    setRootOffset(x, y)
    document.body.style.left = `${x}px`
    document.body.style.top = `${y}px`
    saveWindowInfoDebounce({
      offsetX: x,
      offsetY: y,
      isMaximized: appState.isFullscreen,
    })
  }

  const handleDown = (clientX: number, clientY: number) => {
    if (appState.isFullscreen) return
    handleMouseUp()
    dragging = true
    msEvent.msDownX = clientX
    msEvent.msDownY = clientY
    msEvent.isMsDown = true
    msEvent.winX = parseInt(document.body.style.left)
    if (isNaN(msEvent.winX)) msEvent.winX = DEFAULT_OFFSET
    msEvent.winY = parseInt(document.body.style.top)
    if (isNaN(msEvent.winY)) msEvent.winY = DEFAULT_OFFSET
  }

  const handleMouseDown = (event: MouseEvent) => {
    if (checkIgnoreEl(event.target as HTMLElement)) return
    handleDown(event.clientX, event.clientY)
  }
  const handleMouseMove = (event: MouseEvent) => {
    handleMove(event.clientX, event.clientY)
  }
  const handleMouseUp = () => {
    msEvent.isMsDown = false
    dragging = false
  }

  // 触屏设备上按住工具栏拖动会抢占页面滚动，移动端也不需要窗口拖动，因此不注册触摸监听
  const enableTouchDrag = !isMobileViewport() && !isTouchDevice()
  const handleTouchDown = (event: TouchEvent) => {
    if (event.changedTouches.length) {
      const touch = event.changedTouches[0]
      if (checkIgnoreEl(touch.target as HTMLElement)) return
      handleDown(touch.clientX, touch.clientY)
    }
  }
  const handleTouchMove = (event: TouchEvent) => {
    if (!enableTouchDrag) return
    if (event.changedTouches.length) {
      const touch = event.changedTouches[0]
      handleMove(touch.clientX, touch.clientY)
      event.preventDefault()
    }
  }

  dom.addEventListener('mousedown', handleMouseDown)
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  if (enableTouchDrag) {
    dom.addEventListener('touchstart', handleTouchDown)
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleMouseUp)
  }
  const removeMaximize = windowMaximize(dom)
  return () => {
    dom.removeEventListener('mousedown', handleMouseDown)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    if (enableTouchDrag) {
      dom.removeEventListener('touchstart', handleTouchDown)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleMouseUp)
    }
    removeMaximize()
  }
}
