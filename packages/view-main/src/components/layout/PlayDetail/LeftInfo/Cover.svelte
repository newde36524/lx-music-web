<script lang="ts">
  import { onMount } from 'svelte'
  import { settingState } from '@/modules/setting/store/state'
  import { isMobileViewport } from '@/shared/browser/mobile'
  import CoverCD from './CoverCD.svelte'
  import CoverSquare from './CoverSquare.svelte'

  // 移动端沉浸式「歌词页」强制使用方形封面（作为顶部全宽横幅），
  // 桌面端仍尊重 playDetail.coverStyle 设置（CD / 方形）。
  let isMobile = $state(isMobileViewport())
  onMount(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const update = () => {
      isMobile = mq.matches
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  })
</script>

{#if isMobile || settingState.setting['playDetail.coverStyle'] === 'square'}
  <CoverSquare />
{:else}
  <CoverCD />
{/if}
