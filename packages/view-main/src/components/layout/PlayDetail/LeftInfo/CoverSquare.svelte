<script lang="ts">
  import Image from '@/components/base/Image.svelte'
  import { musicInfo } from '@/modules/player/reactive.svelte'
  import { setShowPlayDetail } from '@/modules/playDetail/store/commit'
  import { skipNext, skipPrev } from '@/modules/player/actions'
  import { playDetailLyricsMode } from '@/modules/playDetail/reactive.svelte'
  import { MEDIA_QUERY_MOBILE } from '@/shared/browser/mobile'

  // let { introend }: { introend: boolean } = $props()

  let pic = $derived($musicInfo.pic)

  const isMobile = () => window.matchMedia(MEDIA_QUERY_MOBILE).matches

  // 封面手势（移动端沉浸式「歌词页」）：
  // - 按住封面 → 封面悬浮缩小（过渡动画），滑动时跟随手指（不超出原始区域）
  // - 按住时四周空位显示方向提示：左=退出页面，上=下一首，右=显示歌词，下=上一首
  // - 松手：右滑 → 进入纯歌词模式；左滑 → 退出详情页；上滑 → 下一首；下滑 → 上一首；否则回弹
  //   （上滑→下一首与效果图「上滑可切换下一首」一致；若改回上滑=上一首需同步提示文案）
  let swipeStartX = 0
  let swipeStartY = 0
  let swipeActive = false
  let pressed = $state(false) // 按住（缩小 + 显示方向提示）
  let dragging = $state(false) // 正在拖动（跟随手指，无过渡）
  let dragX = $state(0) // 手指原始位移（用于手势判定/方向提示）
  let dragY = $state(0)
  let coverW = $state(0) // 封面原始尺寸（用于限制拖动范围）
  let coverH = $state(0)
  // 可视位移：限制在原始封面区域内（缩放 0.86 后最多可移动 (1-0.86)/2 = 7% 的边长）。
  // 手势判定仍用原始 dragX/dragY（左滑/上滑/下滑需要足够位移），只有视觉跟随被约束。
  const PRESS_SCALE = 0.86
  const viewX = $derived(Math.max(-coverW * (1 - PRESS_SCALE) / 2, Math.min(coverW * (1 - PRESS_SCALE) / 2, dragX)))
  const viewY = $derived(Math.max(-coverH * (1 - PRESS_SCALE) / 2, Math.min(coverH * (1 - PRESS_SCALE) / 2, dragY)))
  // 当前拖动方向对应的高亮提示：'left' | 'top' | 'right' | 'bottom' | ''（无）
  const hintActive = $derived(
    dragging
      ? Math.abs(dragX) > Math.abs(dragY)
        ? dragX < 0
          ? 'left'
          : 'right'
        : dragY < 0
          ? 'top'
          : 'bottom'
      : '',
  )

  const resetGesture = () => {
    pressed = false
    dragging = false
    dragX = 0
    dragY = 0
  }

  const handlePointerDown = (e: PointerEvent) => {
    swipeStartX = e.clientX
    swipeStartY = e.clientY
    swipeActive = true
    if (playDetailLyricsMode.value) {
      // 纯歌词模式：封面已缩小为顶部小图标，这里只记录起点，松手时判定轻点 → 切回封面模式
      return
    }
    if (isMobile()) {
      pressed = true
      dragging = false
      dragX = 0
      dragY = 0
      // 记录封面原始尺寸，用于限制拖动范围（封面不超出原始区域）
      const el = e.currentTarget as HTMLElement
      coverW = el.offsetWidth
      coverH = el.offsetHeight
    }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // 部分环境不支持 setPointerCapture，忽略
    }
  }
  const handlePointerMove = (e: PointerEvent) => {
    if (playDetailLyricsMode.value) return
    if (!pressed) return
    const dx = e.clientX - swipeStartX
    const dy = e.clientY - swipeStartY
    // 位移超过 8px 才视为拖动（否则视为轻点，保留回弹）
    if (!dragging && Math.abs(dx) + Math.abs(dy) > 8) dragging = true
    dragX = dx
    dragY = dy
  }
  const handlePointerUp = () => {
    if (!swipeActive) return
    swipeActive = false
    if (playDetailLyricsMode.value) {
      // 纯歌词模式：轻点小图标 → 放大切回封面模式
      const dx = dragX
      const dy = dragY
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) playDetailLyricsMode.value = false
      return
    }
    const dx = dragX
    const dy = dragY
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    resetGesture()
    // 向右滑：水平位移足够大且以水平方向为主 → 进入纯歌词模式（仅移动端）
    if (dx > 80 && absX > absY * 1.2) {
      if (isMobile()) playDetailLyricsMode.value = true
      return
    }
    // 向左滑：水平位移足够大且以水平方向为主 → 退出详情页
    if (dx < -80 && absX > absY * 1.2) {
      setShowPlayDetail(false)
      return
    }
    // 垂直滑动（仅移动端）：以上下为主 → 上滑下一首 / 下滑上一首（与效果图「上滑可切换下一首」一致）
    if (isMobile() && absY > absX * 1.2) {
      if (dy < -80) skipNext()
      else if (dy > 80) skipPrev()
    }
    // 轻点：不再切换纯歌词（改为右滑进入），无操作
  }
</script>

<div
  class="cover"
  class:lyrics-mode={playDetailLyricsMode.value}
  role="presentation"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={resetGesture}
>
  <!-- 可视封面：承担缩放/位移变换，四周缩小后露出的空位用于显示方向提示 -->
  <div
    class="cover-scale"
    class:dragging={dragging}
    style:transform={`translate(${viewX}px, ${viewY}px) scale(${pressed ? PRESS_SCALE : 1})`}
  >
    <Image src={pic} />
    <!-- 移动端沉浸式「歌词页」：在封面横幅底部叠加歌手 / 专辑名 -->
    <div class="cover-overlay">
      <span class="cover-singer">{$musicInfo.singer}</span>
      {#if $musicInfo.album}
        <span class="cover-album">{$musicInfo.album}</span>
      {/if}
    </div>
  </div>
  <!-- 按住封面时四周空位显示的方向提示（不随封面缩放/移动，固定在四周） -->
  <div class="hint hint-left" class:show={pressed} class:active={hintActive === 'left'}>退出页面</div>
  <div class="hint hint-top" class:show={pressed} class:active={hintActive === 'top'}>下一首</div>
  <div class="hint hint-right" class:show={pressed} class:active={hintActive === 'right'}>显示歌词</div>
  <div class="hint hint-bottom" class:show={pressed} class:active={hintActive === 'bottom'}>上一首</div>
</div>

<style lang="less">
  .cover {
    position: relative;
    flex: none;
    width: var(--content-width);
    aspect-ratio: 1 / 1;
    contain: strict;
  }
  // 可视封面：负责缩放/位移（按住缩小、拖动跟随），其余属性与原来 .cover 一致
  .cover-scale {
    position: absolute;
    inset: 0;
    background-color: var(--color-primary-light-300-alpha-800);
    border: 1px solid var(--color-primary-alpha-800);
    border-radius: 6px;
    box-shadow: 0 0 6px var(--color-primary-dark-200-alpha-600);
    transition: transform 0.15s ease;
    &.dragging {
      transition: none; // 拖动时立即跟随手指
    }

    :global {
      .pic {
        width: 100%;
        height: 100%;
        object-fit: cover;
        // border-radius: 50%;
        // mask-image: radial-gradient(circle, transparent 0%, transparent 16%, black 16%);
        &.empty-pic {
          background-color: var(--color-primary-light-300-alpha-700);
        }
      }
    }
  }
  // 歌手 / 专辑名叠加层只在移动端横幅上显示，桌面端隐藏
  .cover-overlay {
    display: none;
  }
  // 方向提示（默认隐藏，按住时显示，拖动到对应方向时高亮）
  .hint {
    position: absolute;
    z-index: 3;
    padding: 5px 12px;
    color: #fff;
    font-size: 12px;
    line-height: 1;
    white-space: nowrap;
    pointer-events: none;
    background-color: rgb(0 0 0 / 45%);
    border-radius: 999px;
    opacity: 0;
    transition:
      opacity 0.15s ease,
      transform 0.15s ease,
      background-color 0.15s ease;
    &.show {
      opacity: 1;
    }
    &.active {
      background-color: var(--color-primary);
    }
  }
  .hint-left {
    top: 50%;
    left: 14px;
    transform: translateY(-50%);
    &.active {
      transform: translateY(-50%) scale(1.08);
    }
  }
  .hint-top {
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    &.active {
      transform: translateX(-50%) scale(1.08);
    }
  }
  .hint-right {
    top: 50%;
    right: 14px;
    transform: translateY(-50%);
    &.active {
      transform: translateY(-50%) scale(1.08);
    }
  }
  .hint-bottom {
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    &.active {
      transform: translateX(-50%) scale(1.08);
    }
  }

  // 移动端沉浸式「歌词页」：专辑封面变成顶部全宽横幅，底部改为「透明度渐变」
  // 融入背后的高斯模糊背景，并在横幅底部叠加歌手 / 专辑名。
  // 进入纯歌词模式时封面缩到接近图标大小、水平居中置顶（flex-basis/width 过渡动画），
  // 轻点小图标放大切回封面模式。
  @media (max-width: @breakpoint-mobile) {
    .cover {
      order: 1;
      flex: none;
      flex-basis: 50%;
      width: 100%;
      height: auto;
      aspect-ratio: auto;
      align-self: center; // 宽度收缩时保持水平居中
      contain: none; // 取消 contain，让缩放/位移的封面能露出四周空位
      transition:
        flex-basis 0.28s ease,
        width 0.28s ease,
        height 0.28s ease;
    }
    .cover-scale {
      border: none;
      border-radius: 0;
      box-shadow: none;
      background-color: transparent; // 底部不再铺深色块，背景交给高斯模糊页面背景

      // 封面底部改为「透明度渐变」：用遮罩让封面在底部边缘完全透明（替代原白色渐变），
      // 透出背后的高斯模糊背景，使封面与背景相融；歌手/专辑名叠加层不受遮罩影响。
      // （遮罩只作用在 .pic 上，.cover-overlay 是独立元素，保持不透明可读）
      .cover:not(.lyrics-mode) & :global(.pic) {
        -webkit-mask-image: linear-gradient(to bottom, black 55%, transparent 100%);
        mask-image: linear-gradient(to bottom, black 55%, transparent 100%);
      }
    }
    .cover-overlay {
      position: absolute;
      left: 20px;
      right: 20px;
      bottom: 16px;
      z-index: 1; // 盖在 ::after 渐变之上
      display: flex;
      flex-flow: column nowrap;
      align-items: flex-start;
      gap: 4px;
      pointer-events: none;

      span {
        max-width: 100%;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        text-shadow:
          0 1px 2px rgb(0 0 0 / 55%),
          0 2px 4px rgb(0 0 0 / 35%);
      }
      .cover-singer {
        font-size: 15px;
        font-weight: 600;
        color: var(--color-font);
      }
      .cover-album {
        font-size: 12px;
        color: var(--color-font-label);
      }
    }

    // 纯歌词模式：封面缩成顶部居中小图标（接近图标大小），去掉横幅渐变与歌手/专辑叠加
    .cover.lyrics-mode {
      flex-basis: 56px;
      width: 56px;
      height: 56px;

      .cover-scale {
        border-radius: 8px;
        box-shadow: 0 2px 8px rgb(0 0 0 / 30%);
        // 歌词模式小图标不做透明度渐变遮罩（.cover.lyrics-mode 已排除遮罩规则）
      }
      .cover-overlay {
        display: none;
      }
    }
  }
</style>
