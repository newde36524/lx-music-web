import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sveltePreprocess } from 'svelte-preprocess'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const rootPath = path.join(dirname, '../../')
const projectPath = path.join(rootPath, 'packages/view-lyric')

// timeout 作为保险丝：svelte-preprocess 直接调 less 编译 <style lang="less">，
// 默认 120000ms，QEMU 模拟下（buildx 交叉构建非本机架构）可能被真超时。600000
// 只影响卡死的下限，不影响正常编译。注意：构建日志里的 `[less] timed-out` 其实
// 不是这里的超时，而是 Vite worker 锁误报，见 vite.config.js 的 preprocessorMaxWorkers。
export const lessConfig = {
  timeout: 600000,
  modifyVars: {
    hack: `true; @import "${path.join(projectPath, 'src/assets/styles/mixin.less')}";`,
  },
}

const config = {
  // Consult https://github.com/sveltejs/language-tools/blob/master/docs/preprocessors/in-general.md
  // for more information about preprocessors
  compilerOptions: {
    runes: true,
  },
  preprocess: [
    sveltePreprocess({
      typescript: {
        tsconfigFile: path.join(projectPath, 'tsconfig.json'),
      },
      less: lessConfig,
    }),
  ],
}

export default config
