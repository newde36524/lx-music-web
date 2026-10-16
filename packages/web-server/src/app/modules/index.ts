// import { initDielikeList } from './dislikeList'
import { initDislikeList } from '@any-listen/app/modules/dislikeList'
import { initDownload } from '@any-listen/app/modules/download'
import { initAppLog } from '@any-listen/app/modules/logs'
import { initProxyServer } from '@any-listen/app/modules/proxyServer'
import { API_PREFIX, PROXY_SERVER_PATH } from '@any-listen/common/constants'

import { appState } from '../app'
// import { initUserApi } from './userApi'
import { workers } from '../worker'
import { initCommand } from './command'
import { initExtension } from './extension'
import { initHotKey } from './hotKey'
import { initMusicList } from './musicList'
import { initPlayer } from './player'
import { initResources } from './resources'
import { initSync } from './sync'
// import { initMusicList } from './musicList'
import { initTheme } from './theme'

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
    })),
    initMusicList(),
    initExtension(),
    initResources(),
    initSync(),
    // proxyHost 只用于把 al-ps-host: 开头的虚拟代理地址解析成真实 URL（见 buildRealPublicPath），
    // 用相对路径 '.' 在 dev（dev server 把 /api 代理回后端）和 prod 都成立，
    // 之前 dev 传 localhost:9501 会让局域网的手机拿到一个连不上的地址。
    initProxyServer('.', `${API_PREFIX}${PROXY_SERVER_PATH}`, appState.cacheDataPath),
    initCommand(),
    initAppLog(appState.dataPath),
  ])
  // initMusicList()
  // initDielikeList()
  // initUserApi()
}
