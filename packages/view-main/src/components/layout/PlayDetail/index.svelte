<script lang="ts">
  import { playDetailLyricsMode, isShowPlayDetail } from '@/modules/playDetail/reactive.svelte'
  import { fly } from 'svelte/transition'
  import Header from './Header.svelte'
  import Main from './Main.svelte'
  import { useHidePlayDtail } from './shared/useHidePlayDtail'
  import Footer from './Footer/index.svelte'
  import { useSettingValue } from '@/modules/setting/reactive.svelte'
  import { tick, untrack } from 'svelte'
  import { MODAL_CLASSNAMES } from '@/shared/constants'
  import { buildUrl, checkPicUrl } from '@any-listen/web'
  import { settingState } from '@/modules/setting/store/state'
  import { musicInfo } from '@/modules/player/reactive.svelte'
  import { appState } from '@/modules/app/store/state'
  import { themeState } from '@/modules/theme/store/state'
  let bgSrc = $state<string>()
  const isDynamicBackground = useSettingValue('playDetail.isDynamicBackground')
  const hidePlayDtail = useHidePlayDtail()
  let domContainer: HTMLElement | null = $state(null)

  // 移动端背景：直接取当前封面做模糊色调（不受 playDetail.isDynamicBackground 设置影响），
  // 让整页背景色调始终跟随歌词封面（参照效果图）。
  // 切歌时新歌封面尚未加载（pic 为 null）期间，保留上一首封面做背景，
  // 避免背景瞬时变透明、露出底层页面（如「我喜欢」列表）造成切换闪烁。
  let bgCoverPic = $state<string | null>($musicInfo?.pic ?? null)
  let bgCover = $derived.by(() => {
    const pic = $musicInfo?.pic ?? bgCoverPic
    return pic ? `url(${buildUrl(pic, settingState.setting['network.proxyAllResources'], appState.proxyServerHost)})` : 'none'
  })
  $effect(() => {
    if ($musicInfo?.pic) bgCoverPic = $musicInfo.pic
  })

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

    // 沉浸式全屏：进入详情页时把浏览器工具栏/状态栏颜色设为深色（匹配顶部暗色蒙版），
    // 关闭时恢复为主界面背景色。配合 viewport-fit=cover 让页面背景延伸到全屏、
    // 系统工具栏叠加在页面之上（不再露出白色空白）。theme-color 主要对 Android Chrome
    // 生效；iOS Safari 浏览器模式忽略 theme-color，但会把 html/body 的 background-color
    // 画到状态栏后方（参照 ai.animedb.cn：它仅用 html/body 背景色就染了整个状态栏），
    // 而本应用 html/body 为 transparent（真实背景在 #root 子元素上），透明会回退成白色。
    // 因此打开详情页时把 html/body 背景同步为深色，让状态栏区域也是深色（纯全屏）。
    const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', '#1a1a1a')
    }
    const rootHtml = document.documentElement
    const rootBody = document.body
    // 移动端 responsive.less 给 html 设了 `background: var(--color-content-background) !important`，
    // 会盖过普通内联 background-color（内联不带 !important 压不住样式表的 !important），
    // 所以这里用带 !important 的内联声明覆盖（内联 !important 优先级高于样式表 !important）。
    rootHtml.style.setProperty('background-color', '#1a1a1a', 'important')
    rootBody.style.setProperty('background-color', '#1a1a1a', 'important')

    untrack(() => {
      void tick().then(() => {
        parentNode = domContainer?.parentElement
        if (!parentNode) return
        parentNode.classList.add(MODAL_CLASSNAMES.fullscreenModal)
      })
    })

    return () => {
      // 关闭详情页：恢复工具栏/状态栏颜色为主界面背景色，并还原 html/body 背景
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      if (meta) {
        meta.setAttribute('content', themeState.theme.colors['--color-main-background'] ?? '#ffffff')
      }
      // 移除内联覆盖，回退到样式表/inline 的原始背景（移动端 content-background，桌面端 transparent）
      document.documentElement.style.removeProperty('background-color')
      document.body.style.removeProperty('background-color')
    }
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
  >
    <div class="bg" style:background-image={bgSrc}></div>
    <div class="bg-cover" style:background-image={bgCover}></div>
    <!-- 暗色罩：独立元素叠在模糊封面上（在带 background-image 的元素上用 ::after 叠渐变
         在部分浏览器/渲染下不生效，故用独立 div），保证白色歌词/文字可读，
         顶部加深避免露出浅色天空的模糊（实现纯全屏，头部不是白底）。 -->
    <div class="bg-cover-mask"></div>
    <Header />
    <Main />
    <Footer />
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
    // 高度直接用动态视口高度（100dvh，回退 100vh），不依赖容器百分比：
    // 移动端浏览器地址栏/工具栏伸缩时，歌词详情页高度跟随可见视口，
    // 底部播放栏从进入页面起就贴合底部（修复首屏底部有多余空白、需上下滑动才贴底的问题）。
    height: 100vh;
    height: 100dvh;
    contain: strict;
    // 沉浸式背景（模糊封面，叠暗色罩，偏深）：覆盖标题/标签色为浅色，保证白字可读。
    // 桌面端同样使用沉浸式封面背景（不再铺绿色壁纸/主题底色），故这里统一覆盖。
    // 歌词颜色不在此覆盖：由 LyricPlayer 统一用 --color-400 / #fff（移动端/桌面端一致）。
    --color-font: #fff;
    --color-font-label: rgb(255 255 255 / 65%);
    color: var(--color-font);
    // 兜底背景色：即使封面缺失（bgCover 为 none）也不透出底层页面，
    // 保证详情页在任何情况下都是不透明全屏（避免切歌闪烁露出「我喜欢」页面）。
    background-color: #1a1a1a;
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
  }

  // 暗色罩：盖在模糊封面上（独立元素，不用 ::after —— 在带 background-image 的元素上
  // 用 ::after 叠渐变在部分浏览器/渲染下不生效）。顶部加深（75% 黑），
  // 让模糊背景一直延伸到视口顶部（纯全屏，头部不是白底），同时保证白色歌词/文字可读。
  // 仅移动端生效（桌面端封面为圆形 CD，顶部加深会让封面浅色天空与背景对比过强）。
  .bg-cover-mask {
    position: absolute;
    top: 0;
    left: 0;
    z-index: -1;
    display: none;
    width: 100%;
    height: 100%;
    pointer-events: none;
    background: linear-gradient(to bottom, rgb(0 0 0 / 75%) 0%, rgb(0 0 0 / 30%) 40%, rgb(0 0 0 / 30%) 100%);
  }

  @media (max-width: @breakpoint-playdetail-mobile) {
    .play-detail {
      border-radius: 0;
      // 移动端沉浸式：顶部预留状态栏/刘海安全区，把内容（封面横幅、纯歌词小图标）下移到
      // 系统状态栏下方（不再被状态栏遮挡）。背景（.bg-cover/.bg-cover-mask，z-index:-1 绝对定位）
      // 仍铺满整个视口（含状态栏后方），保持沉浸式全屏；只有内容盒被下移。
      padding-top: env(safe-area-inset-top, 0px);
    }

    // 移动端显示暗色罩（桌面端隐藏，见 .bg-cover-mask 基础样式）
    .bg-cover-mask {
      display: block;
    }
  }
</style>
