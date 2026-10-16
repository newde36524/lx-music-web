import { mount, tick, unmount } from 'svelte'

import { onDesconnected } from '@/modules/app/shared'

import App from './App.svelte'

/**
 * 选一首歌下载时挑音质。返回 Promise<string>（选中的音质），取消时 reject。
 */
export const showDownloadQualityModal = async (musicInfo: AnyListen.Music.MusicInfoOnline): Promise<string> => {
  const app = mount(App, {
    target: document.getElementById('root')!,
    props: {
      onafterleave() {
        void unmount(app, { outro: true })
      },
    },
  })
  const release = () => {
    app.hide()
    unsub()
  }
  const unsub = onDesconnected(release)
  await tick()
  return app.show(musicInfo).finally(() => {
    unsub()
  })
}
