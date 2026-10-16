<script lang="ts">
  import RightControlBtns from './RightControlBtns.svelte'
  import LeftControlBtns from './LeftControlBtns.svelte'
  import MiddlePlayProgress from './MiddlePlayProgress.svelte'
  import PlayBtns from './PlayBtns.svelte'
  import PlayStatusText from './PlayStatusText.svelte'
  import { fade } from 'svelte/transition'

  let { introend }: { introend: boolean } = $props()
</script>

<div class="footer">
  {#if introend}
    <div in:fade={{ delay: 5 }} class="footer-content">
      <div class="control">
        <div class="side">
          <LeftControlBtns />
        </div>
        <PlayBtns />
        <div class="side right">
          <RightControlBtns />
        </div>
      </div>
      <MiddlePlayProgress />
      <PlayStatusText />
    </div>
  {/if}
</div>

<style lang="less">
  .footer {
    flex: none;
    height: 100px;
    contain: strict;

    @media (max-width: @breakpoint-mobile) {
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

    @media (max-width: @breakpoint-mobile) {
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
    @media (max-width: @breakpoint-small) {
      flex: 0;
      display: none;
    }
  }

  .right {
    justify-content: flex-end;
    padding-left: 16px;
    margin-left: -10px;
  }
</style>
