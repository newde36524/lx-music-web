<script lang="ts">
  import { fade } from 'svelte/transition'
  import LyricPlayer from './LyricPlayer.svelte'
  import { lyricHorizontalSwipe, playDetailLyricsMode } from '@/modules/playDetail/reactive.svelte'

  // 纯歌词模式下按住左滑/右滑 → 切回封面模式。
  // 歌词容器只做垂直滚动（touch-action: pan-y），横向手势不会被浏览器当作滚动消费，
  // 配合 setPointerCapture 保证手指移出容器也能收到 pointerup（与封面左滑手势一致）。
  // 横向手势进行时置 lyricHorizontalSwipe，让歌词自身的拖动/滚动（useLyric）忽略本次移动。
  let lyricSwipeStartX = 0
  let lyricSwipeStartY = 0
  let lyricSwipeActive = false
  let lyricPress = $state(false) // 按住（显示「切换回封面」提示）
  const handleLyricPointerDown = (e: PointerEvent) => {
    if (!playDetailLyricsMode.value) return
    lyricSwipeStartX = e.clientX
    lyricSwipeStartY = e.clientY
    lyricSwipeActive = true
    lyricPress = true
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // 部分环境不支持 setPointerCapture，忽略
    }
  }
  const handleLyricPointerMove = (e: PointerEvent) => {
    if (!lyricSwipeActive || !playDetailLyricsMode.value) return
    const dx = e.clientX - lyricSwipeStartX
    const dy = e.clientY - lyricSwipeStartY
    // 位移足够大且以水平方向为主 → 判定为「左右滑切回封面」手势，锁定歌词滚动
    if (Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > 10) {
      lyricHorizontalSwipe.value = true
    }
  }
  const handleLyricPointerUp = (e: PointerEvent) => {
    if (!lyricSwipeActive) return
    lyricSwipeActive = false
    lyricPress = false
    lyricHorizontalSwipe.value = false
    if (!playDetailLyricsMode.value) return
    const dx = e.clientX - lyricSwipeStartX
    const dy = e.clientY - lyricSwipeStartY
    // 向左或向右滑：水平位移足够大且以水平方向为主 → 返回封面模式
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      playDetailLyricsMode.value = false
    }
  }
</script>

<div
  class="right-lyric"
  role="presentation"
  onpointerdown={handleLyricPointerDown}
  onpointermove={handleLyricPointerMove}
  onpointerup={handleLyricPointerUp}
  onpointercancel={() => {
    lyricSwipeActive = false
    lyricPress = false
    lyricHorizontalSwipe.value = false
  }}
>
  <!-- 歌词内容不再用 introend 门控延迟到入场动画结束后才渲染：
       入场时（封面飞入）就渲染，内容从进入页面起就可见（修复首屏底部空白）。
       in:fade 保留：组件挂载（详情页打开）时做一次快速淡入。 -->
  <div in:fade={{ delay: 5 }} class="right-lyric-content">
    <LyricPlayer />
  </div>
  <!-- 按住歌词时显示的「切换回封面」提示（左右滑动都可触发） -->
  <div class="lyric-hint" class:show={lyricPress}>← 切换回封面 →</div>
</div>

<style lang="less">
  .right-lyric {
    position: relative;
    flex: auto;
    contain: strict;
    // 只允许浏览器做垂直滚动（歌词上下滚动）；横向手势交给应用处理（返回封面模式），
    // 避免浏览器把横向手势当作 pan 消费掉导致 pointerup 不触发。
    touch-action: pan-y;
  }
  .right-lyric-content {
    position: absolute;
    inset: 0;
    // margin-right: 20px;
  }
  // 按住歌词时显示的「切换回封面」提示（与封面方向提示同风格）
  .lyric-hint {
    position: absolute;
    top: 50%;
    left: 50%;
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
    transform: translate(-50%, -50%);
    transition:
      opacity 0.15s ease,
      transform 0.15s ease;
    &.show {
      opacity: 1;
    }
  }

  // 移动端沉浸式「歌词页」：歌词排在封面横幅之后、歌曲信息之前
  @media (max-width: @breakpoint-playdetail-mobile) {
    .right-lyric {
      order: 2;
      flex: auto;
      min-height: 0;
      contain: none;
    }
  }
</style>
