<script lang="ts">
  import Aside from '@/components/layout/Aside/index.svelte'
  import Header from '@/components/layout/Header/index.svelte'
  import Main from '@/components/layout/Main.svelte'
  import PlayBar from '@/components/layout/PlayBar/index.svelte'
  import PlayDetail from '@/components/layout/PlayDetail/index.svelte'
</script>

<div id="app-main">
  <Aside />
  <div id="app-right">
    <Header />
    <Main />
  </div>
</div>
<PlayBar />
<PlayDetail />

<style lang="less">
  #app-main {
    position: relative;
    z-index: 1;
    display: flex;
    flex: auto;
    flex-flow: row nowrap;
  }
  #app-right {
    position: relative;
    display: flex;
    // border-left: 2px solid var(--color-border);

    flex: auto;
    flex-flow: column nowrap;

    // border-top-left-radius: @radius-border;
    // border-bottom-left-radius: @radius-border;
    overflow: hidden;
    // box-shadow: 0px 0px 4px rgba(0, 0, 0, 0.1);

    // &:before {
    //   .mixin-after();
    //   left: 0;
    //   top: 0;
    //   width: 100%;
    //   height: 100%;
    //   transition: background-color @transition-normal;
    //   background-color: var(--color-main-background);
    //   opacity: .9;
    //   // z-index: -1;
    // }
  }

  // 移动端：顶部预留状态栏/刘海安全区，把工具栏（含搜索框）下移到可操作位置，
  // 避免被系统状态栏遮挡。PlayDetail 是 #app-main 的兄弟节点，不受影响（保持沉浸式全屏）。
  @media (max-width: @breakpoint-mobile) {
    #app-right {
      padding-top: env(safe-area-inset-top, 0px);
    }
  }
</style>
