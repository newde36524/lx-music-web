<script lang="ts">
  import { skipNext, skipPrev, togglePlay } from '@/modules/player/actions'
  import { playing } from '@/modules/player/reactive.svelte'
  import { t } from '@/plugins/i18n'
  import { onMount } from 'svelte'
  import { MEDIA_QUERY_MOBILE } from '@/shared/browser/mobile'

  // 与外部播放条(PlayBar)保持一致的按钮尺寸：
  // PlayBar 容器高度 移动端 58px / 桌面 72px，图标因子 0.52/0.65 →
  // 上下曲 30/37px、播放/暂停 37/46px（移动端/桌面）。
  const getIconSize = () => {
    const isMobile = typeof window !== 'undefined' && window.matchMedia(MEDIA_QUERY_MOBILE).matches
    const height = isMobile ? 58 : 72
    return {
      iconSize: `${Math.trunc(height * 0.52)}px`,
      iconSize2: `${Math.trunc(height * 0.65)}px`,
    }
  }
  const initial = getIconSize()
  let iconSize = $state(initial.iconSize)
  let iconSize2 = $state(initial.iconSize2)

  onMount(() => {
    const mq = window.matchMedia(MEDIA_QUERY_MOBILE)
    const update = () => {
      const { iconSize: s, iconSize2: s2 } = getIconSize()
      iconSize = s
      iconSize2 = s2
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  })
</script>

<div class="container">
  <button class="btn" aria-label={$t('player__prev')} onclick={async () => skipPrev()}>
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width={iconSize} height={iconSize} viewBox="0 0 24 24">
      <use xlink:href="#icon-skip-prev" />
    </svg>
  </button>
  <button class="btn" aria-label={$playing ? $t('player__pause') : $t('player__play')} onclick={togglePlay}>
    {#if $playing}
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width={iconSize2} height={iconSize2} viewBox="0 0 24 24">
        <use xlink:href="#icon-pause" />
      </svg>
    {:else}
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width={iconSize2} height={iconSize2} viewBox="0 0 24 24">
        <use xlink:href="#icon-play" />
      </svg>
    {/if}
  </button>
  <button class="btn" aria-label={$t('player__next')} onclick={async () => skipNext()}>
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width={iconSize} height={iconSize} viewBox="0 0 24 24">
      <use xlink:href="#icon-skip-next" />
    </svg>
  </button>
</div>

<style lang="less">
  .container {
    display: flex;
    flex: none;
    flex-flow: row nowrap;
    gap: 14px;
    align-items: center;
    height: 100%;
    padding-right: 10px;
    padding-left: 10px;

    @media (max-width: @breakpoint-mobile) {
      gap: 12px;
      padding-right: 8px;
      padding-left: 8px;
    }
  }
  .btn {
    display: flex;
    flex: none;
    // padding: 5px;
    padding: 0;
    color: var(--color-button-font);
    cursor: pointer;
    background-color: transparent;
    border: none;
    opacity: 1;
    transition: @transition-fast;
    transition-property: color, opacity;
    &:hover {
      opacity: 0.8;
    }
    &:active {
      opacity: 0.6;
    }
  }

  // 移动端：背景是高斯模糊封面（叠暗色罩，偏深），控件用白色（参照效果图）
  @media (max-width: @breakpoint-mobile) {
    .btn {
      color: #fff;
    }
  }
</style>
