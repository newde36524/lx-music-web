<script lang="ts">
  import RightControlBtns from './RightControlBtns.svelte'
  import LeftControlBtns from './LeftControlBtns.svelte'
  import MiddlePlayProgress from './MiddlePlayProgress.svelte'
  import PlayBtns from './PlayBtns.svelte'
  import PlayStatusText from './PlayStatusText.svelte'
  import TogglePlayModeBtn from '@/components/common/TogglePlayModeBtn.svelte'
  import PlaylistBtn from '@/components/common/PlaylistBtn/index.svelte'
  import { fade } from 'svelte/transition'

  // 窄屏（手机）只保留「随机 + 上一曲/播放/下一曲 + 播放列表」五个按钮（参照效果图），
  // 隐藏音效 / 倍速 / 评论 / 桌面歌词 / 收藏 / 音量等次要按钮；宽屏保持完整控制栏。
  // 需求：大尺寸页面的歌词详情页显示效果也和手机端一样 → 恒为移动端精简控制栏。
  let isSmall = $state(true)
</script>

<div class="footer">
  <!-- 播放栏内容不再用 introend 门控延迟到入场动画结束后才渲染：
       入场时（封面飞入）就渲染，底部操作栏从进入页面起就贴合底部
       （修复首屏底部有多余空白、需上下滑动才贴底的问题）。
       in:fade 保留：组件挂载（详情页打开）时做一次快速淡入。 -->
  <div in:fade={{ delay: 5 }} class="footer-content">
      <div class="control">
        {#if isSmall}
          <div class="side"><TogglePlayModeBtn /></div>
          <PlayBtns />
          <div class="side right"><PlaylistBtn /></div>
        {:else}
          <div class="side">
            <LeftControlBtns />
          </div>
          <PlayBtns />
          <div class="side right">
            <RightControlBtns />
          </div>
        {/if}
      </div>
      <MiddlePlayProgress />
      <PlayStatusText />
      <!-- 移动端沉浸式「歌词页」底部提示：上滑封面可切换下一首（参照效果图）。
           手势在 CoverSquare（上滑=下一首），此提示常驻，仅移动端显示。 -->
      <div class="swipe-hint">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
          <path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z" fill="currentColor" />
        </svg>
        <span>上滑可切换下一首</span>
      </div>
    </div>
</div>

<style lang="less">
  .footer {
    flex: none;
    height: 100px;
    contain: strict;

    @media (max-width: @breakpoint-playdetail-mobile) {
      // 移动端沉浸式「歌词页」播放栏：控制按钮与外部播放条(PlayBar)同尺寸（30/37px），
      // footer 高度按「进度条 21px + 控制行 38px + 上滑提示 20px + 底部内边距 8px」预留。
      height: 88px;
    }
  }
  .footer-content {
    position: relative;
    display: flex;
    flex-flow: column nowrap;
    height: 100%;
    padding: 0 30px 16px;
    > :global(.middle-play-progress) {
      flex: none;
      width: 100%;
    }

    @media (max-width: @breakpoint-playdetail-mobile) {
      padding: 0 10px 12px;
    }
  }
  .control {
    display: flex;
    flex: auto;
    flex-flow: row nowrap;
  }

  .side {
    position: relative;
    display: flex;
    flex: 1;
    flex-flow: row nowrap;
    align-items: center;
    height: 100%;
    padding-top: 15px;

    // 窄屏放不下两侧各 4 个按钮，隐藏掉（音效 / 倍速 / 评论 / 桌面歌词），保留中间的播放控制
    @media (max-width: @breakpoint-playdetail-mobile) {
      flex: 0;
      display: none;
    }
  }

  .right {
    justify-content: flex-end;
    padding-left: 16px;
    margin-left: -10px;
  }

  // 移动端沉浸式「歌词页」底部「上滑可切换下一首」提示（参照效果图）。
  // 桌面端不显示（宽屏用不到上滑手势）。
  .swipe-hint {
    display: none;
  }

  // 移动端沉浸式「歌词页」：进度条放到控制按钮上方（参照效果图），并拉通到整行。
  // 控制行固定高度（flex: none），让 PlayBtns 的按钮尺寸确定、不随内容溢出。
  // 控制行高度需容纳与 PlayBar 同尺寸的播放按钮（37px）。
  @media (max-width: @breakpoint-mobile) {
    .footer-content {
      padding: 0 18px 8px;
      :global(.middle-play-progress) {
        order: -1;
        width: 100%;
      }
      .control {
        order: 0;
        flex: none;
        height: 38px; // 固定控制行高度 → 容纳 30/37px 的播放按钮
      }
      :global(.play-status) {
        order: 1;
        // 底部留给「上滑可切换下一首」提示，暂停/加载状态文字不再显示（有播放按钮图标提示）
        display: none;
      }
    }
    .swipe-hint {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      gap: 4px;
      order: 2;
      margin-top: auto; // 靠到播放栏底部
      font-size: 12px;
      line-height: 1;
      color: rgba(255, 255, 255, 0.5);
      user-select: none;
      pointer-events: none;
      svg {
        flex: none;
        opacity: 0.8;
      }
    }
  }

  // 窄屏（手机）：显示「随机」和「播放列表」，两侧各 flex:1 把中间的播放按钮组居中（参照效果图）。
  // 注意：要覆盖上面基础 .side 规则里 @media (max-width: @breakpoint-small) 的 display:none，
  // 所以这条必须写在它之后。
  @media (max-width: @breakpoint-playdetail-mobile) {
    .side {
      flex: 1;
      display: flex;
      padding-top: 0; // 与播放按钮组保持同一垂直中心线

      // 两侧的「播放顺序」「播放列表」图标与中间播放按钮同尺寸（参照效果图）
      :global(.btn),
      :global(.icon) {
        width: 37px;
        color: #fff; // 控件用白色（背景是高斯模糊封面，叠暗色罩，偏深）
      }
    }
  }
</style>
