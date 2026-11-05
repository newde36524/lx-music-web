import { buildUrl } from '@any-listen/web'

import { onRelease } from '@/modules/app/shared'
import { appState } from '@/modules/app/store/state'
import { settingEvent } from '@/modules/setting/store/event'
import { settingState } from '@/modules/setting/store/state'
import { createUnsubscriptionSet } from '@/shared'

import { onPlayerCreated } from '../shared'
import { playerEvent } from '../store/event'
import { playerState } from '../store/state'

let unregistered = createUnsubscriptionSet()

/**
 * 网站图标（浏览器标签页 favicon）跟随歌曲封面实时变化。
 * - 有封面：把 <link rel="icon"> 的 href 设为当前封面（走代理地址），浏览器会自动缩放到标签图标大小。
 * - 无封面：移除动态图标，回退浏览器默认图标。
 * - 监听 musicChanged / picUpdated 实现实时更新；代理设置变化时重建 URL。
 */
export const initFavicon = () => {
  onRelease(unregistered.clear.bind(unregistered))

  let iconLink: HTMLLinkElement | null = null

  const updateFavicon = () => {
    const pic = playerState.musicInfo.pic
    if (pic) {
      const url = buildUrl(pic, settingState.setting['network.proxyAllResources'], appState.proxyServerHost)
      if (!iconLink) {
        iconLink = document.createElement('link')
        iconLink.rel = 'icon'
        document.head.appendChild(iconLink)
      }
      if (iconLink.getAttribute('href') !== url) iconLink.href = url
    } else {
      // 无封面：移除动态图标，回退浏览器默认
      iconLink?.remove()
      iconLink = null
    }
  }

  onPlayerCreated(() => {
    unregistered.register((unregistered) => {
      unregistered.add(playerEvent.on('musicChanged', updateFavicon))
      unregistered.add(playerEvent.on('picUpdated', updateFavicon))
      unregistered.add(
        settingEvent.on('updated', (keys) => {
          if (keys.includes('network.proxyAllResources')) updateFavicon()
        })
      )
      updateFavicon()
    })
  })
}
