<script lang="ts">
  import Logo from './Logo.svelte'
  import Nav from './Nav.svelte'
  import MyList from './MyList/index.svelte'
  import { useAsideDrawer } from '@/modules/app/reactive.svelte'
  // import { useSettingValue } from '@/modules/setting/reactive.svelte'
  // export let params = {}

  // console.log(params)

  const drawer = useAsideDrawer()
</script>

<div class="aside" class:drawer-open={drawer.isOpen} onclick={drawer.close}>
  {#if import.meta.env.VITE_IS_MAC}
    <div class="drag-no-any-modal" style="padding-top: calc(env(titlebar-area-height, 30px) + 4px)"></div>
  {/if}
  {#if !import.meta.env.VITE_IS_MAC}
    <Logo />
  {/if}
  <Nav />
  <MyList />
</div>
<div class="drawer-mask" class:open={drawer.isOpen} role="presentation" onclick={drawer.close}></div>

<style lang="less">
  .aside {
    // background-color: var(--color-primary-light-900-alpha-900);
    display: flex;
    flex: none;
    flex-flow: column nowrap;
    // 固定宽度而不是百分比：中档视口铺满时 20% 会跟着视口变大变小，显得松散
    width: @width-aside;
    // box-shadow: 0 0 5px rgba(0, 0, 0, .3);
    // transition: @transition-normal;
    // transition-property: background-color;
    // background-color: @color-theme-sidebar;
    // background-color: @color-aside-background;
    // border-right: 2px solid var(--color-primary);
    // -webkit-user-select: none;
    background-color: var(--color-app-background);

    // &.fullscreen {
    //   .logo {
    //     display: none;
    //   }
    // }
    // TODO: 兼容MAC
    // :global(.aside-logo + .aside-nav) {
    //   padding-top: 20px;
    // }

    // 移动端：侧栏收进抽屉，由顶部工具栏的菜单按钮或左右滑动手势唤出
    @media (max-width: @breakpoint-mobile) {
      position: fixed;
      top: 0;
      left: 0;
      // 要压在点击捕获层之上、但低于弹窗/右键菜单（它们都是 z-index: 10），
      // 否则从抽屉里长按唤出的菜单会被捕获层盖住
      z-index: 5;
      width: 80%;
      max-width: @width-aside-mobile;
      height: 100%;
      height: 100dvh;
      padding: 6px 0;
      // --color-app-background 只有 10% 不透明度，抽屉会直接透底，这里用不透明的内容底色
      background-color: var(--color-main-background);
      transform: translateX(-100%);
      transition: transform @transition-fast;
      transition-property: transform;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;

      &.drawer-open {
        transform: translateX(0);
      }
    }
  }

  // 移动端：不再压暗背景，只留一层点击捕获区用来「点空白处收起抽屉」
  .drawer-mask {
    display: none;

    @media (max-width: @breakpoint-mobile) {
      position: fixed;
      inset: 0;
      z-index: 4;
      display: block;
      background: none;
      pointer-events: none;

      &.open {
        pointer-events: auto;
      }
    }
  }

  // :global(html.mac .aside-nav) {
  //   padding-top: env(titlebar-area-height, 30px);
  // }
</style>
