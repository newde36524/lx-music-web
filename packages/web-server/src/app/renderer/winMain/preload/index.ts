import { createIPC } from '@/preload/ipc'
import type { IPCSocket } from '@/preload/ws'

import { createClientApp, createExposeApp } from './app'
import { createClientData } from './data'
import { createClientDesktopLyric } from './desktopLyric'
import { createClientDislike, createExposeDislike } from './dislike'
import { createClientDownload, createExposeDownload } from './download'
import { createClientExtension, createExposeExtension } from './extension'
import { createClientHotkey, createExposeHotkey } from './hotkey'
import { createClientList, createExposeList } from './list'
import { createClientMusic } from './music'
import { createClientPlayer, createExposePlayer } from './player'
import { createClientResource } from './resource'
import { createClientSoundEffect } from './soundEffect'
import { createClientSync, createExposeSync } from './sync'
import { createClientTheme, createExposeTheme } from './theme'

console.log('preload win main')

export type ExposeFunctions = AnyListen.IPC.ClientIPCActions<IPCSocket>
export type ExposeServerFunctions = Omit<
  AnyListen.IPC.ServerIPC,
  | 'exitApp'
  | 'showOpenDialog'
  | 'showSaveDialog'
  | 'openDirInExplorer'
  | 'openDevTools'
  | 'getSystemFonts'
  | 'minWindow'
  | 'fullscreenWindow'
>
export type ClientCall = AnyListen.IPC.ClientIPC

// dev 下前端跑在 9500、后端跑在 9501，view-main 的 dev server 把 /api 代理回后端，
// 所以这里和 prod 一样用同源地址；写死 localhost:9501 会让局域网的手机连不上 IPC socket。
const host = `${location.origin}${location.pathname}`

const connectIPCService: AnyListen.IPC.ConnectIPCSrivice = ({
  onConnected,
  onDisconnected,
  onFailed,
  onLogout,
  pwd,
  clientCall,
}) => {
  const exposeObj: ExposeFunctions = {
    ...createExposeApp(clientCall),
    ...createExposePlayer(clientCall),
    ...createExposeHotkey(clientCall),
    ...createExposeList(clientCall),
    ...createExposeDislike(clientCall),
    ...createExposeDownload(clientCall),
    ...createExposeTheme(clientCall),
    ...createExposeExtension(clientCall),
    ...createExposeSync(clientCall),
  }
  createIPC({
    exposeObj,
    host,
    authCode: pwd,
    winType: 'main',
    onDisconnected,
    onFailed,
    onLogout,
    onConnected(ipcSocket) {
      const ipc: ExposeServerFunctions = {
        ...createClientApp(ipcSocket),
        ...createClientPlayer(ipcSocket),
        ...createClientData(ipcSocket),
        ...createClientHotkey(ipcSocket),
        ...createClientList(ipcSocket),
        ...createClientMusic(ipcSocket),
        ...createClientResource(ipcSocket),
        ...createClientDislike(ipcSocket),
        ...createClientDownload(ipcSocket),
        ...createClientTheme(ipcSocket),
        ...createClientExtension(ipcSocket),
        ...createClientSoundEffect(ipcSocket),
        ...createClientDesktopLyric(ipcSocket),
        ...createClientSync(ipcSocket),
      }
      onConnected(ipc as AnyListen.IPC.ServerIPC)
    },
  })
}

// @ts-expect-error
window.__anylisten_ipc_init__ = connectIPCService
