<script lang="ts">
  import Logo from './Logo.svelte'
  import ControlBtns from './ControlBtns.svelte'
  import SearchInput from './SearchInput.svelte'
  import { useAsideDrawer } from '@/modules/app/reactive.svelte'
  import { t } from '@/plugins/i18n'
  import { windowDarg } from '@/shared/browser/widnow.svelte'

  const drawer = useAsideDrawer()
</script>

{#if import.meta.env.VITE_IS_DESKTOP}
  <div class="toolbar drag-no-any-modal">
    <button type="button" class="menu-btn" aria-label={$t('main.aside_drawer')} aria-expanded={drawer.isOpen} onclick={drawer.toggle}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M3 6h18M3 12h18M3 18h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </button>
    <div class="left">
      <SearchInput />
    </div>
    <!-- <SearchInput /> -->
    {#if import.meta.env.VITE_IS_MAC}
      <Logo />
    {:else}
      <ControlBtns />
    {/if}
  </div>
{/if}
{#if import.meta.env.VITE_IS_WEB}
  <div class="toolbar" {@attach windowDarg}>
    <button type="button" class="menu-btn" aria-label={$t('main.aside_drawer')} aria-expanded={drawer.isOpen} onclick={drawer.toggle}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M3 6h18M3 12h18M3 18h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </button>
    <div class="left">
      <SearchInput />
    </div>
    <!-- <SearchInput /> -->
    <div class="control-wrap">
      <ControlBtns />
    </div>
  </div>
{/if}

<style lang="less" module>
  .toolbar {
    position: relative;
    z-index: 2;
    display: flex;
    flex: none;
    flex-flow: row nowrap;
    align-items: center;
    height: @height-toolbar;
    // justify-content: space-between;
    // background-color: var(--background-color);
    // border-bottom: 1px solid var(--color-border);

    // &:before {
    //   .mixin-after();
    //   left: 0;
    //   top: 0;
    //   width: 100%;
    //   height: 100%;
    //   background-color: var(--color-main-background);
    //   opacity: .9;
    //   z-index: -1;
    // }
  }
  .left {
    display: flex;
    flex: auto;
    flex-flow: row nowrap;
    // gap: 25px;
    align-items: center;
    height: 100%;
    margin-left: 12px;
    min-width: 0;
    :global {
      .search-input {
        // background-color: transparent;
        // border-bottom: 2px solid var(--color-primary-background);
        &::placeholder {
          font-size: 0.98em;
          color: var(--color-button-font);
        }
      }
    }
  }

  .control-wrap {
    display: flex;
    flex: none;
    align-items: center;
  }

  // 移动端不显示窗口控制按钮，把腾出来的宽度让给搜索框
  @media (max-width: @breakpoint-mobile) {
    .control-wrap {
      display: none;
    }

    .left {
      :global {
        .search-input {
          --width: 100%;
          --min-width: 0;
          --max-width: none;
        }
      }
    }
  }

  // 移动端唤出侧栏抽屉的菜单按钮
  .menu-btn {
    display: none;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 36px;
    margin-left: 6px;
    color: var(--color-button-font);
    cursor: pointer;
    background: none;
    border: none;
    border-radius: @radius-border;
    transition: @transition-fast;
    transition-property: background-color, opacity;

    &:hover {
      background-color: var(--color-button-background-hover);
    }
    &:active {
      opacity: 0.6;
    }

    @media (max-width: @breakpoint-mobile) {
      display: flex;
    }
  }

  // .logo {
  //   box-sizing: border-box;
  //   padding: 0 @height-toolbar * .4;
  //   height: @height-toolbar;
  //   color: var(--color-primary);
  //   flex: none;
  //   text-align: center;
  //   line-height: @height-toolbar;
  //   font-weight: bold;
  // }
  // .search {
  //   margin-left: 20px;
  //   :global(.searchInput) {
  //     background-color: transparent;
  //     border-bottom: 2px solid var(--color-primary-background);
  //     &::placeholder {
  //       color: var(--color-button-font);
  //       font-size: .98em;
  //     }
  //   }
  // }
</style>
