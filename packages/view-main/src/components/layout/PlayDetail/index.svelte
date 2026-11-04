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
    // 沉浸式背景（模糊封面，叠暗色罩，偏深）：覆盖主题色为浅色，保证白字可读。
    // 桌面端同样使用沉浸式封面背景（不再铺绿色壁纸/主题底色），故这里统一覆盖。
    --color-font: #fff;
    --color-font-label: rgb(255 255 255 / 65%);
    --color-300: rgb(255 255 255 / 50%);
    --color-250: rgb(255 255 255 / 50%);
    --color-400: rgb(255 255 255 / 55%);
    --color-primary-dark-100: #fff;
    color: var(--color-font);
    background-color: transparent; // 背景交给 .bg-cover（模糊封面）
    // overflow: hidden;
    border-radius: @radius-border;
    // border-left: 12px solid var(--color-primary-alpha-900);
    // will-change: transform;

    // 白字在模糊封面上加轻微投影，保证可读（中性色，不带绿色光晕）
    :global {
      * {
        text-shadow: 0 1px 2px rgb(0 0 0 / 45%), 0 2px 4px rgb(0 0 0 / 25%);
      }
      svg {
        filter: drop-shadow(0 0 2px rgb(0 0 0 / 35%));
      }
    }

    &.dybg {
      :global {
        .progress {
          > .progress {
            box-shadow:
              0 0 2px var(--color-primary-light-200-alpha-800),
              0 0 4px var(--color-primary-light-200-alpha-800);
          }
        }
      }
    }
  }

  // 隐藏原壁纸背景（.bg）：详情页统一使用当前封面做模糊色调（.bg-cover），
  // 不再铺绿色/主题壁纸（需求：不要有绿色的蒙版）。
  .bg {
    display: none;
  }

  // 沉浸式背景：当前封面的高斯模糊（所有尺寸统一，桌面端也生效）。
  // 背景用当前封面做模糊色调（跟随歌词封面），因此隐藏原壁纸背景（.bg）。
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
      // 高斯模糊背景上叠暗色：保留封面色调（与封面相融），又保证白色歌词/文字可读。
      // 顶部额外加深（封面顶部已改为透明度渐变，此处透出的是同一封面浅色天空的模糊，
      // 需加深才不会有「白色模糊」，让背景一直延伸到状态栏/视口顶部，实现纯全屏）。
      background: linear-gradient(to bottom, rgb(0 0 0 / 75%) 0%, rgb(0 0 0 / 30%) 40%, rgb(0 0 0 / 30%) 100%);
    }
  }

  @media (max-width: @breakpoint-playdetail-mobile) {
    .play-detail {
      border-radius: 0;
    }
  }
</style>
