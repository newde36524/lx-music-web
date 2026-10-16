import { type MessagePort, parentPort } from 'node:worker_threads'

import { DEV_SERVER_PORTS } from '@any-listen/common/constants'
import type { UserConfig } from 'vite'

import { dynamicImport } from './import-esm.cjs'
import { type Target, type TaskName, build } from './utils'

if (!parentPort) throw new Error('Require run in worker')

// dev 和 prod 都用相对路径：view-main / view-lyric 的 dev server 把
// packages/web-server/server/public 当 publicDir 直接托管（见各自 vite.config.js 的 dirs.web.publicDir），
// 而 web-preload 在 dev 下输出的正是不带 hash 的 view-main.ipc.js / view-lyric.ipc.js。
// 之前 dev 写死 http://localhost:9501/...，局域网里的手机会把 localhost 解析成手机自己，
// IPC 脚本加载不到，页面就一直卡在 Loading 白屏。
const WEB_VIEW_MAIN_IPC = './view-main.ipc.js'
const WEB_VIEW_LYRIC_IPC = './view-lyric.ipc.js'

type ViewMainTarget = 'desktop' | 'web'
const getViewMainConfig = async (target: Target) => {
  const { buildConfig } = (await dynamicImport('@any-listen/view-main')) as {
    buildConfig: (target: ViewMainTarget, port: number, path: string) => Promise<UserConfig>
  }
  if (target !== 'desktop' && target !== 'web') throw new Error(`Invalid target for view-main: ${target}`)
  return buildConfig(target, DEV_SERVER_PORTS['view-main'], target == 'web' ? WEB_VIEW_MAIN_IPC : '')
}
const getViewLyricConfig = async (target: Target) => {
  const { buildConfig } = (await dynamicImport('@any-listen/view-lyric')) as {
    buildConfig: (target: ViewMainTarget, port: number, path: string) => Promise<UserConfig>
  }
  if (target !== 'desktop' && target !== 'web') throw new Error(`Invalid target for view-lyric: ${target}`)
  return buildConfig(target, DEV_SERVER_PORTS['view-lyric'], target == 'web' ? WEB_VIEW_LYRIC_IPC : '')
}

// const getExtensionPreloadConfig = async (target: Target) => {
//   const { buildConfig } = await dynamicImport('@any-listen/extension-preload/vite.config')
//   return buildConfig(target)
// }

let buildResult: {
  status: boolean
  reload: () => void
}

parentPort.on('message', async ({ port, taskName, target }: { port?: MessagePort; taskName: TaskName; target: Target }) => {
  if (!port) {
    buildResult.reload()
    return
  }
  const configs = {
    desktop: async (mode: Target) => import('@any-listen/desktop').then((m) => m.buildConfig(mode)),
    'web-server': async (mode: Target) => import('@any-listen/web-server').then((m) => m.buildConfig(mode)),
    'web-preload': async (mode: Target) => import('@any-listen/web-server').then((m) => m.buildPreloadConfig(mode)),
    'view-main': getViewMainConfig,
    'view-lyric': getViewLyricConfig,
    'extension-preload': async (mode: Target) => {
      return import('@any-listen/extension-preload/vite.config').then((m) => m.buildConfig(mode))
    },
  } as const
  // assert(port instanceof MessagePort)
  const sendStatus = () => {
    port.postMessage({
      status: 'updated',
    })
  }
  void build(await configs[taskName](target), sendStatus).then((result) => {
    buildResult = result
    port.postMessage({
      status: result.status ? 'success' : 'error',
    })
  })
})
