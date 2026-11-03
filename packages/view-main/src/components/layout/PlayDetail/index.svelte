<script lang="ts">
  import { playDetailLyricsMode, isShowPlayDetail } from '@/modules/playDetail/reactive.svelte'
  import { fly } from 'svelte/transition'
  import Header from './Header.svelte'
  import Main from './Main.svelte'
  import { useHidePlayDtail } from './shared/useHidePlayDtail'
  import Footer from './Footer/index.svelte'
  import { playDetailState } from '@/modules/playDetail/store/state'
  import { useSettingValue } from '@/modules/setting/reactive.svelte'
  import { tick, untrack } from 'svelte'
  import { MODAL_CLASSNAMES } from '@/shared/constants'
  import { buildUrl, checkPicUrl } from '@any-listen/web'
  import { settingState } from '@/modules/setting/store/state'
  import { musicInfo } from '@/modules/player/reactive.svelte'
  import { appState } from '@/modules/app/store/state'
  let introend = $state(playDetailState.isShowPlayDetail)
  let bgSrc = $state<string>()
  const isDynamicBackground = useSettingValue('playDetail.isDynamicBackground')
  const hidePlayDtail = useHidePlayDtail()
  let domContainer: HTMLElement | null = $state(null)

  // 移动端背景：直接取当前封面做模糊色调（不受 playDetail.isDynamicBackground 设置影响），
  // 让整页背景色调始终跟随歌词封面（参照效果图）。
  let bgCover = $derived(
    $musicInfo?.pic
      ? `url(${buildUrl($musicInfo.pic, settingState.setting['network.proxyAllResources'], appState.proxyServerHost)})`
      : 'none',
  )

  const handlePic = (url?: string | null) => {
    if (url) {
      url = buildUrl(url, settingState.setting['network.proxyAllResources'], appState.proxyServerHost)
      void checkPicUrl(url, settingState.setting['network.proxyAllResources'], appState.proxyServerHost).then((vaild) => {
        if (vaild) {
          bgSrc = `url(${url})`
        } else {
          bgSrc = undefined
        }
      })
    } else {
      bgSrc = undefined
    }
  }
  $effect(() => {
    if (!isDynamicBackground.val) {
      bgSrc &&= undefined
      return
    }
    handlePic($musicInfo?.pic)
  })

  let parentNode: HTMLElement | null | undefined = null
  $effect(() => {
    if (!$isShowPlayDetail) {
      // 关闭详情页时重置回封面模式，下次打开默认显示封面
      playDetailLyricsMode.value = false
      if (parentNode) {
        parentNode.classList.remove(MODAL_CLASSNAMES.fullscreenModal)
        parentNode = null
      }
      return
    }

    untrack(() => {
      void tick().then(() => {
        parentNode = domContainer?.parentElement
        if (!parentNode) return
        parentNode.classList.add(MODAL_CLASSNAMES.fullscreenModal)
      })
    })
  })
</script>

{#if $isShowPlayDetail}
  <div
    in:fly={{ x: '100%', opacity: 1, delay: 10 }}
    out:fly={{ x: '-100%', opacity: 1, delay: 10 }}
    class="play-detail"
    class:dybg={bgSrc}
    role="alert"
    bind:this={domContainer}
    oncontextmenu={hidePlayDtail}
    onintroend={() => {
      introend = true
    }}
    onoutroend={() => {
      introend = false
    }}
  >
    <div class="bg" style:background-image={bgSrc}></div>
    <div class="bg-cover" style:background-image={bgCover}></div>
    <Header />
    <Main {introend} />
    <Footer {introend} />
  </div>
{/if}

<style lang="less">
  .play-detail {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 10;
    display: flex;
    flex-flow: column nowrap;
    width: 100%;
    height: 100%;
    contain: strict;
    color: var(--color-font);
    background-color: var(--color-content-background);
    // overflow: hidden;
    border-radius: @radius-border;
    // border-left: 12px solid var(--color-primary-alpha-900);
    // will-change: transform;

    &.dybg {
      :global {
        * {
          text-shadow:
            0 0 2px var(--color-primary-light-100-alpha-900),
            0 0 3px var(--color-primary-light-100-alpha-900),
            0 0 4px var(--color-primary-dark-700-alpha-900);
        }
        svg {
          filter: drop-shadow(0 0 2px var(--color-primary-light-100-alpha-600))
            drop-shadow(0 0 4px var(--color-primary-light-100-alpha-700));
        }
        .progress {
          > .progress {
            box-shadow:
              0 0 2px var(--color-primary-light-200-alpha-800),
              0 0 4px var(--color-primary-light-200-alpha-800);
          }
        }
      }
      .bg {
        background-size: 125% 125%;
        &::before {
          background-color: var(--color-content-background);
          opacity: 0.7;
        }
        &::after {
          background-color: transparent;
          backdrop-filter: blur(30px);
        }
      }
    }
  }
  .bg {
    position: absolute;
    top: 0;
    left: 0;
    z-index: -1;
    width: 100%;
    height: 100%;
    background: var(--background-image) var(--background-image-position) no-repeat;
    background-size: var(--background-image-size);
    // background-size: 110% 110%;
    // filter: blur(60px);
    opacity: 0.7;
    &::before {
      display: block;
      width: 100%;
      height: 100%;
      content: '';
      background-color: var(--color-app-background);
    }
    &::after {
      position: absolute;
      top: 0;
      left: 0;
      display: block;
      width: 100%;
      height: 100%;
      content: '';
      background-color: var(--color-main-background);
    }
  }

  // 移动端沉浸式「歌词页」：整页铺满，专辑封面改为顶部全宽横幅。
  // 背景用当前封面做模糊色调（跟随歌词封面），因此隐藏原壁纸背景（.bg）。
  .bg-cover {
    display: none; // 仅移动端显示
  }
  @media (max-width: @breakpoint-mobile) {
    .play-detail {
      border-radius: 0;
      background-color: var(--color-content-background);
    }
    .bg {
      display: none;
    }
    .bg-cover {
      position: absolute;
      top: 0;
      left: 0;
      z-index: -1;
      display: block;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-position: center;
      background-repeat: no-repeat;
      background-size: cover;
      // 背景为当前封面的高斯模糊：放大 1.25 倍避免模糊后边缘露出透明边，
      // 与顶部封面横幅（底部已改为透明渐变）相融。
      filter: blur(40px);
      transform: scale(1.25);
      pointer-events: none;

      &::after {
        display: block;
        width: 100%;
        height: 100%;
        content: '';
        // 高斯模糊背景上叠一层轻微暗色：保留封面色调（与顶部封面相融），
        // 又保证白色歌词/文字在任意封面上都可读（参照效果图）。
        background-color: rgb(0 0 0 / 30%);
      }
    }
  }
</style>
