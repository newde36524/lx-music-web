/**
 * 移动端适配相关的非响应式工具。
 *
 * 断点统一定义在这里，避免散落在各组件的样式与判断逻辑中。
 * - 视口宽度断点：决定按移动端布局渲染（侧栏变抽屉、播放栏精简、表格折叠列等）
 * - 指针类型断点：决定触摸相关行为（禁用桌面窗口拖动、去掉双击缩放延迟等），
 *   用 `(pointer: coarse)` 而不是设备类型判断，混合屏笔记本不会因为带触摸屏就被当成手机
 */

// 桌面布局是一个固定 1020px 宽的「假窗口」（最小窗口 828px），
// 720~1020px 这段其实也放不下，所以断点直接提到 900，避免这段区间横向溢出。
/** 视口宽度小于等于该值时按移动端布局渲染 */
export const MOBILE_BREAKPOINT = 900
/** 更窄的视口下进一步简化界面（隐藏次要控件、只保留核心播放按钮） */
// 注意：需要与 assets/styles/variables.less 里的 @breakpoint-small 保持一致
export const SMALL_BREAKPOINT = 560

export const MEDIA_QUERY_MOBILE = `(max-width: ${MOBILE_BREAKPOINT}px)`
export const MEDIA_QUERY_SMALL = `(max-width: ${SMALL_BREAKPOINT}px)`

let mobileQuery: MediaQueryList | undefined
let smallQuery: MediaQueryList | undefined

const getMobileQuery = (): MediaQueryList | undefined => {
  if (typeof window == 'undefined') return
  mobileQuery ||= window.matchMedia(MEDIA_QUERY_MOBILE)
  return mobileQuery
}
const getSmallQuery = (): MediaQueryList | undefined => {
  if (typeof window == 'undefined') return
  smallQuery ||= window.matchMedia(MEDIA_QUERY_SMALL)
  return smallQuery
}

/**
 * 是否以触屏为主输入（与 CSS 的 `@media (pointer: coarse)` 保持一致）。
 * 不用 `maxTouchPoints` 判断，否则带触摸屏的笔记本也会被当成手机处理。
 */
export const isTouchDevice = (): boolean => {
  if (typeof window == 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/** 当前视口是否为移动端尺寸 */
export const isMobileViewport = (): boolean => getMobileQuery()?.matches ?? false

/** 当前视口是否为窄屏（在移动端之上进一步简化的区间） */
export const isSmallViewport = (): boolean => getSmallQuery()?.matches ?? false

/** 是否需要移动端布局：小视口或触屏设备 */
export const isMobileDevice = (): boolean => isMobileViewport() || isTouchDevice()

/**
 * 移动端给 html 挂上 `mobile` / `small` 类，便于纯 CSS 场景判断。
 * 返回清理函数。
 */
export const initMobileClass = (): (() => void) => {
  const dom = document.documentElement
  const update = () => {
    dom.classList.toggle('mobile', isMobileViewport())
    dom.classList.toggle('small', isSmallViewport())
  }
  const m = getMobileQuery()
  const s = getSmallQuery()
  m?.addEventListener('change', update)
  s?.addEventListener('change', update)
  update()
  return () => {
    m?.removeEventListener('change', update)
    s?.removeEventListener('change', update)
  }
}
