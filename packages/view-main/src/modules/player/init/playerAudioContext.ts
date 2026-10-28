import { onVisibilityChange } from '@any-listen/web'

import { onRelease } from '@/modules/app/shared'
import { resumeAudioContext, suspendAudioContext } from '@/plugins/player'
import { createUnsubscriptionSet } from '@/shared'
import { clearTimeoutBg, setTimeoutBg } from '@/shared/tools'

import { onPlayerCreated } from '../shared'
import { playerEvent } from '../store/event'
import { playerState } from '../store/state'

let unregistered = createUnsubscriptionSet()
let timeoutId: number | null = null
const runSuspendAudioContextTimeout = () => {
  if (timeoutId) return
  timeoutId = setTimeoutBg(() => {
    timeoutId = null
    // Suspend the audio context
    void suspendAudioContext()
  }, 60_000)
}
const stopSuspendAudioContextTimeout = () => {
  if (!timeoutId) return
  clearTimeoutBg(timeoutId)
  timeoutId = null
}

export const initPlayerAudioContext = () => {
  onRelease(unregistered.clear.bind(unregistered))
  onPlayerCreated(() => {
    unregistered.register((unregistered) => {
      unregistered.add(
        playerEvent.on('playStatusChanged', (status) => {
          if (status) {
            stopSuspendAudioContextTimeout()
          } else {
            runSuspendAudioContextTimeout()
          }
        })
      )
      // 从其他页面/App 切回来时，若音频仍在播放则恢复 AudioContext，
      // 避免「无声但播放进度一直在走」的问题（切后台时浏览器/系统可能挂起了 AudioContext）
      unregistered.add(
        onVisibilityChange((hidden) => {
          if (hidden) return
          if (playerState.playerPlaying) {
            stopSuspendAudioContextTimeout()
            void resumeAudioContext()
          }
        })
      )
      // 从 bfcache（往返缓存）恢复时（浏览器未重载页面），同样恢复 AudioContext
      const handlePageShow = (event: PageTransitionEvent) => {
        if (!event.persisted) return
        if (playerState.playerPlaying) {
          stopSuspendAudioContextTimeout()
          void resumeAudioContext()
        }
      }
      window.addEventListener('pageshow', handlePageShow)
      unregistered.add(() => {
        window.removeEventListener('pageshow', handlePageShow)
      })
    })

    if (!playerState.playing) {
      runSuspendAudioContextTimeout()
    }
  })
}
