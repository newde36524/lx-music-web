<script lang="ts">
  import { DOWNLOAD_STATUS } from '@any-listen/common/constants'
  import { tick } from 'svelte'

  import Btn from '@/components/base/Btn.svelte'
  import Image from '@/components/base/Image.svelte'
  import Menu, { type MenuList } from '@/components/base/Menu.svelte'
  import SvgIcon from '@/components/base/SvgIcon.svelte'
  import { i18n, t, type Message } from '@/plugins/i18n'
  import { translateDownloadMessage } from '@/modules/download'
  import { sizeFormate } from '@/shared'

  let {
    task,
    canOpenFile,
    onretry,
    oncancel,
    onremove,
    onunfile,
  }: {
    task: AnyListen.Download.ListItem
    /** 桌面端能在资源管理器里定位文件，web 端没有这个能力 */
    canOpenFile: boolean
    onretry: () => void
    oncancel: () => void
    onremove: () => void
    onunfile: () => void
  } = $props()

  type MenuType = 'retry' | 'cancel' | 'openFile' | 'remove'

  let menuVisible = $state(false)
  let menuLocation = $state({ x: 0, y: 0 })

  const musicInfo = $derived(task.metadata.musicInfo)
  const picUrl = $derived(musicInfo.meta.picUrl)
  const qualityText = $derived(i18n.t(`settings.player.music_quality_${task.metadata.quality}` as keyof Message))
  const isActive = $derived(task.status == DOWNLOAD_STATUS.RUN || task.status == DOWNLOAD_STATUS.WAITING)
  const isCompleted = $derived(task.status == DOWNLOAD_STATUS.COMPLETED)
  const isError = $derived(task.status == DOWNLOAD_STATUS.ERROR)
  const progress = $derived(task.status == DOWNLOAD_STATUS.COMPLETED ? 100 : Math.max(0, Math.min(100, task.progress)))

  const statusText = $derived.by(() => {
    switch (task.status) {
      case DOWNLOAD_STATUS.COMPLETED:
        return $t('download.status.completed')
      case DOWNLOAD_STATUS.ERROR:
        return task.statusText ? translateDownloadMessage(task.statusText) : $t('download.status.error')
      case DOWNLOAD_STATUS.WAITING:
        return $t('download.status.waiting')
      case DOWNLOAD_STATUS.PAUSE:
        return $t('download.status.pause')
      default:
        return task.statusText || $t('download.status.run')
    }
  })

  const menus = $derived<MenuList<MenuType>>([
    { action: 'retry', label: $t('download.action.retry'), disabled: isActive },
    { action: 'cancel', label: $t('download.action.cancel'), disabled: !isActive },
    canOpenFile && isCompleted ? { action: 'openFile', label: $t('download.action.open_file') } : null,
    null,
    { action: 'remove', label: $t('download.action.remove') },
  ])

  const showMenu = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    menuLocation = { x: event.clientX, y: event.clientY }
    void tick().then(() => {
      menuVisible = true
    })
  }

  const handleMenuClick = (menu: NonNullable<(typeof menus)[number]>) => {
    switch (menu.action) {
      case 'retry':
        onretry()
        break
      case 'cancel':
        oncancel()
        break
      case 'openFile':
        onunfile()
        break
      case 'remove':
        onremove()
        break
    }
    menuVisible = false
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="item" oncontextmenu={showMenu} data-status={task.status}>
  <div class="pic">
    <!-- width/height 必须带单位，Image 是直接拼进 style 的 -->
    <Image src={picUrl} alt={musicInfo.name} width="44px" height="44px" icon="music" />
  </div>

  <div class="main">
    <div class="line">
      <p class="name" data-ignore-tip title={musicInfo.name}>{musicInfo.name}</p>
      <div class="actions">
        <Btn
          min
          icon
          disabled={isActive}
          onclick={() => onretry()}
          aria-label={$t('download.action.retry')}
        >
          <SvgIcon name="refresh" />
        </Btn>
        {#if isActive}
          <Btn min icon onclick={() => oncancel()} aria-label={$t('download.action.cancel')}>
            <SvgIcon name="cancel" />
          </Btn>
        {/if}
        {#if canOpenFile && isCompleted && !import.meta.env.VITE_IS_WEB}
          <Btn min icon onclick={() => onunfile()} aria-label={$t('download.action.open_file')}>
            <SvgIcon name="folder" />
          </Btn>
        {/if}
        <Btn min icon onclick={() => onremove()} aria-label={$t('download.action.remove')}>
          <SvgIcon name="delete" />
        </Btn>
      </div>
    </div>

    <div class="sub-line">
      <p class="sub">
        {musicInfo.singer}
        <span class="sep">·</span>
        <span data-ignore-tip title={task.metadata.fileName}>{qualityText}</span>
        {#if task.total > 0}
          <span class="sep">·</span>
          {sizeFormate(task.total)}
        {/if}
      </p>
      <div class="status-line" class:error={isError} class:done={isCompleted}>
        {#if isActive}
          <div class="progress-bar">
            <div class="fill" style:width="{progress}%"></div>
          </div>
          <span class="tip">{progress.toFixed(1)}%{task.speed ? ` ${task.speed}` : ''}</span>
        {:else if isError}
          <SvgIcon name="close" class="status-icon error" />
          <span class="status-text">{statusText}</span>
        {:else if isCompleted}
          <SvgIcon name="check-true" class="status-icon done" />
          <span class="status-text">{statusText}</span>
        {:else}
          <SvgIcon name="clock" class="status-icon" />
          <span class="status-text">{statusText}</span>
        {/if}
      </div>
    </div>
  </div>
</div>

<Menu bind:visible={menuVisible} {menus} location={menuLocation} onclick={handleMenuClick} />

<style lang="less">
  .item {
    display: flex;
    gap: 10px;
    align-items: center;
    height: 100%;
    padding: 5px;
    border-radius: @radius-border;
    cursor: default;
    overflow: hidden;
    transition: @transition-fast;
    transition-property: background-color;

    &:hover {
      background-color: var(--color-primary-light-400-alpha-700);

      .actions {
        opacity: 1;
      }
    }
  }

  .pic {
    flex: none;
  }

  .main {
    display: flex;
    flex: auto;
    gap: 4px;
    flex-flow: column nowrap;
    min-width: 0;
  }

  .line {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  .name {
    flex: auto;
    min-width: 0;
    margin: 0;
    font-size: 13px;
    color: var(--color-primary-font);
    .mixin-ellipsis-1();
  }

  .sub-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .sub {
    flex: auto;
    min-width: 0;
    margin: 0;
    font-size: 12px;
    color: var(--color-font-label);
    .mixin-ellipsis-1();
  }

  .sep {
    margin: 0 4px;
    color: var(--color-primary-light-300-alpha-800);
  }

  .path {
    color: var(--color-link);
  }

  .actions {
    display: flex;
    gap: 2px;
    flex: none;
    opacity: 0.7;
    transition: @transition-fast;
    transition-property: opacity;
  }

  .item:hover .actions {
    opacity: 1;
  }

  .actions :global(.btn) {
    width: 26px;
    height: 26px;
    min-width: 26px;
    padding: 0;
    color: var(--color-font-label);
  }

  .actions :global(.btn:hover) {
    color: var(--color-primary);
  }

  .status-line {
    flex: none;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--color-font-label);
    min-width: 0;

    &.error {
      color: var(--color-font-error);
    }

    &.done {
      color: var(--color-primary);
    }

    .status-icon {
      flex: none;
      width: 14px;
      height: 14px;
    }

    .status-text {
      min-width: 0;
      .mixin-ellipsis-1();
    }

    .progress-bar {
      flex: none;
      width: 60px;
      height: 4px;
      overflow: hidden;
      background-color: var(--color-primary-light-200-alpha-900);
      border-radius: 2px;
    }

    .fill {
      height: 100%;
      background-color: var(--color-primary);
      border-radius: 2px;
    }

    .tip {
      flex: none;
      min-width: 60px;
      font-size: 12px;
      color: var(--color-font-label);
      text-align: right;
    }
  }

  @media (max-width: @breakpoint-mobile) {
    .item {
      gap: 8px;
      padding: 8px;
      border-radius: @radius-border;
    }

    .pic :global(svg) {
      width: 36px;
      height: 36px;
    }

    .main {
      gap: 4px;
    }

    .name {
      font-size: 13px;
    }

    .sub {
      font-size: 11px;
    }

    .sep {
      margin: 0 2px;
    }

    .actions {
      gap: 0;
      opacity: 1;
    }

    .actions :global(.btn) {
      width: 28px;
      height: 28px;
      min-width: 28px;
      padding: 0;
    }

    .status-line {
      font-size: 11px;
    }

    .progress-bar {
      width: 40px;
    }

    .tip {
      min-width: 40px;
      font-size: 11px;
    }
  }
</style>
