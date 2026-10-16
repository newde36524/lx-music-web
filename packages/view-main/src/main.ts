// import '@common/utils/rendererError'
import { mount } from 'svelte'

import App from './App.svelte'

import 'virtual:svg-icons-register'

import './app.less'
import { initNotify } from './components/apis/notify'
import { initTooltips } from './components/apis/tooltips/global'
import { connectIPC, registerModules } from './modules'
import { initDownloadEvent } from './modules/download'
import { initIpcDesktopLyric } from './shared/ipcLyric/init'
import { initWorkers } from './worker'

// import './components/base/VirtualizedList'
void initWorkers()

mount(App, {
  target: document.getElementById('root')!,
})
initNotify()
initDownloadEvent()

registerModules()
initIpcDesktopLyric()
connectIPC()
initTooltips()
