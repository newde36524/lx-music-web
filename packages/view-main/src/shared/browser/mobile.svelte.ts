import { MEDIA_QUERY_MOBILE, MEDIA_QUERY_SMALL, isTouchDevice } from './mobile'

/**
 * 响应式断点判断。
 * 返回值跟随视口变化（旋转屏幕、拖拽窗口都会触发），供组件在移动端/桌面端切换 UI 使用。
 */
export const useMediaQuery = (media: string) => {
  let matches = $state.raw(typeof window == 'undefined' ? false : window.matchMedia(media).matches)

  $effect(() => {
    if (typeof window == 'undefined') return
    const query = window.matchMedia(media)
    const onChange = () => {
      matches = query.matches
    }
    query.addEventListener('change', onChange)
    onChange()
    return () => {
      query.removeEventListener('change', onChange)
    }
  })

  return {
    get val() {
      return matches
    },
  }
}

export const useIsMobile = () => useMediaQuery(MEDIA_QUERY_MOBILE)
export const useIsSmall = () => useMediaQuery(MEDIA_QUERY_SMALL)

/** 是否触屏设备（运行期不会变化，无需响应式） */
export const useIsTouch = () => isTouchDevice()
