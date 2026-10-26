import { initDislikeList } from '@any-listen/app/modules/dislikeList'
import { initDownload } from '@any-listen/app/modules/download'
import { initAppLog } from '@any-listen/app/modules/logs'

import { appState } from '@/app'
// import { initMusicList } from './musicList'
import { workers } from '@/worker'

import { initAppMenu } from './appMenu'
import { initCommand } from './command'
import { initExtension } from './extension'
// import { initDielikeList } from './dislikeList'
import { initHotKey } from './hotKey'
import { initMusicList } from './musicList'
// import { initUserApi } from './userApi'
import { initPlayer } from './player'
import { initProxyServer } from './proxyServer'
import { initResources } from './resources'
import { initSync } from './sync'
import { initTheme } from './theme'
import { initTray } from './tray'

export const initModules = async () => {
  await Promise.all([
    initHotKey(),
    initPlayer(),
    initTheme(),
    initDislikeList(workers.dbService),
    initDownload(workers.dbService, () => ({
      savePath: appState.appSetting['download.savePath'],
      fileName: appState.appSetting['download.fileName'],
      fallbackSavePath: appState.dataPath,
      addMusicLocationType: appState.appSetting['list.addMusicLocationType'],
      proxy: appState.proxy,
      embedMetadata: appState.appSetting['download.embedMetadata'],
    })),
    initMusicList(),
    initAppMenu(),
    initTray(),
    initExtension(),
    initResources(),
    initProxyServer(),
    initSync(),
    initCommand(),
    initAppLog(appState.dataPath),
  ])
  // initMusicList()
  // initDielikeList()
  // initUserApi()
}
