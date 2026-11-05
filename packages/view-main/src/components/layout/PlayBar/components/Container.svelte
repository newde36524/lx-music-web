<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    children,
    padding,
  }: {
    children: Snippet
    padding?: boolean
  } = $props()
</script>

<div class="player">
  <div class="bg"></div>
  <div class="player-inner" class:padding>
    {@render children()}
  </div>
</div>

<style lang="less">
  .player {
    position: relative;
    // padding: 6px;
    z-index: 2;
    height: @height-player;
    // border-top: 3px solid var(--color-border);
    // display: flex;
    // flex-flow: row nowrap;
    // align-items: center;
    contain: size layout style;
    // box-shadow: 0 0 6px rgba(0, 0, 0, 0.12);
    // border-top-left-radius: 8px;
    // border-top-right-radius: 8px;
    // backdrop-filter: blur(4px);
    // * {
    //   box-sizing: border-box;
    // }

    // &:before {
    //   .mixin-after();
    //   left: 0;
    //   top: 0;
    //   width: 100%;
    //   height: 100%;
    //   box-shadow: 0 0 6px rgba(0, 0, 0, 0.12);
    //   border-top-left-radius: 8px;
    //   border-top-right-radius: 8px;
    //   // background-color: var(--color-main-background);
    //   // opacity: 0.9;
    //   z-index: -1;
    //   backdrop-filter: blur(4px);
    //   transition: @transition-normal;
    //   transition-property: opacity;
    // }

    // 移动端收紧高度，给列表内容留出更多空间。
    // 真机底部 home indicator 安全区（env(safe-area-inset-bottom)，模拟器恒 0）未计入高度，
    // 会导致播放条不贴合物理底部、底部露出空白（与 PlayDetail footer 同源问题）。
    // 故把安全区计入 .player 高度（背景 .bg 覆盖到物理底边），内容盒用 .player-inner 的
    // calc(100% - env(...)) 保持在上方，不被 home indicator 遮挡。
    @media (max-width: @breakpoint-mobile) {
      height: calc(58px + env(safe-area-inset-bottom, 0px));
    }
  }
  .bg {
    width: 100%;
    height: 100%;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    box-shadow: 0 0 6px var(--color-primary-dark-200-alpha-800);
    opacity: 0.8;
    // border-top: 1px solid var(--color-primary-light-300-alpha-800);
    // z-index: -1;
    backdrop-filter: blur(4px);
    transition: @transition-normal;
    transition-property: opacity;
  }
  .player-inner {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    flex-flow: row nowrap;
    align-items: center;
    width: 100%;
    // 真机底部安全区（env(safe-area-inset-bottom)）从内容盒中扣除，让播放按钮/封面
    // 保持在 home indicator 之上；模拟器 env()=0，退化为 height:100%（无变化）。
    height: calc(100% - env(safe-area-inset-bottom, 0px));
    contain: strict;
    transition: @transition-normal;
    transition-property: opacity;
    &.padding {
      padding-right: 10px;
    }
  }
</style>
