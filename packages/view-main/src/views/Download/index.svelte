<script lang="ts">
  import { DOWNLOAD_STATUS } from '@any-listen/common/constants'

  import Btn from '@/components/base/Btn.svelte'
  import Tab from '@/components/base/Tab.svelte'
  import SvgIcon from '@/components/base/SvgIcon.svelte'
  import VirtualizedList from '@/components/base/VirtualizedList.svelte'
  import { showNotify } from '@/components/apis/notify'
  import Empty from '@/components/material/Empty.svelte'
  import { i18n, t } from '@/plugins/i18n'
  import { useListItemHeight } from '@/modules/app/reactive.svelte'
  import {
    cancelAllDownload,
    cancelDownload,
    clearCompletedDownload,
    removeDownload,
    retryDownload,
  } from '@/modules/download'
  import { useDownloadCompletedCount, useDownloadList, useDownloadListInited, useDownloadTaskCount } from '@/modules/download/reactive.svelte'
  import { openDirInExplorer } from '@/shared/ipc/app'

  import DownloadItem from './DownloadItem.svelte'

  type Filter = 'all' | 'active' | 'completed' | 'error'

  let filter = $state<Filter>('all')

  const allList = useDownloadList()
  const inited = useDownloadListInited()
  const activeCount = useDownloadTaskCount()
  const completedCount = useDownloadCompletedCount()
  // 行高要能装下封面 + 三行文字，太小会互相压住
  const listItemHeight = useListItemHeight(3.2)

  const isDesktop = !!import.meta.env.VITE_IS_DESKTOP

  const openFileDir = (task: AnyListen.Download.ListItem) => {
    // 服务端任务记录的是真实路径；浏览器直存的 filePath 只是「目录名/文件名」的展示串
    if (!task.metadata.filePath) return
    if (isDesktop) {
      void openDirInExplorer(task.metadata.filePath)
    } else {
      // Web 版没有本地文件管理器，复制路径到剪贴板
      navigator.clipboard.writeText(task.metadata.filePath).then(() => {
        showNotify(i18n.t('download.file_path_copied'))
      }).catch(() => {})
    }
  }

  const list = $derived.by(() => {
    const tasks = allList.val.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    switch (filter) {
      case 'active':
        return tasks.filter((task) => task.status == DOWNLOAD_STATUS.RUN || task.status == DOWNLOAD_STATUS.WAITING)
      case 'completed':
        return tasks.filter((task) => task.status == DOWNLOAD_STATUS.COMPLETED)
      case 'error':
        return tasks.filter((task) => task.status == DOWNLOAD_STATUS.ERROR)
      default:
        return tasks
    }
  })

  const tabList = $derived([
    { id: 'all' as Filter, label: `${$t('download.filter.all')} ${allList.val.length}` },
    { id: 'active' as Filter, label: `${$t('download.filter.active')} ${activeCount.val}` },
    { id: 'completed' as Filter, label: `${$t('download.filter.completed')} ${completedCount.val}` },
    { id: 'error' as Filter, label: `${$t('download.filter.error')}` },
  ])

  const handleClearCompleted = async () => {
    if (!completedCount.val) return
    await clearCompletedDownload()
    showNotify(i18n.t('download.clear_completed_notify'))
  }

  const handleCancelAll = async () => {
    if (!activeCount.val) return
    await cancelAllDownload()
  }
</script>

<div class="view-container container">
  <header class="header">
    <Tab list={tabList} itemkey="id" itemlabel="label" bind:value={filter} />
    <div class="header-actions">
      {#if activeCount.val}
        <Btn min outline onclick={handleCancelAll}>{$t('download.cancel_all')}</Btn>
      {/if}
      {#if completedCount.val}
        <Btn min outline onclick={handleClearCompleted}>
          <SvgIcon name="erase" />{$t('download.clear_completed')}
        </Btn>
      {/if}
    </div>
  </header>

  {#if list.length}
    <VirtualizedList list={list} keyname="id" itemheight={listItemHeight.val} containerclass="list">
      {#snippet row(task, index)}
        <DownloadItem
          {task}
          canOpenFile={!!task.metadata.filePath}
          onretry={() => void retryDownload([task.id])}
          oncancel={() => void cancelDownload([task.id])}
          onremove={() => void removeDownload([task.id])}
          onunfile={() => openFileDir(task)}
        />
      {/snippet}
    </VirtualizedList>
  {:else if !inited.val}
    <Empty />
  {:else}
    <Empty label={$t('download.empty')} />
  {/if}
</div>

<style lang="less">
  .container {
    padding: 0 15px 15px;
    display: flex;
    flex-flow: column nowrap;
  }

  .header {
    flex: none;
    display: flex;
    flex-flow: row nowrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    margin: 10px 0 6px;
  }

  .header-actions {
    display: flex;
    gap: 6px;
    flex: none;
  }

  .save-path {
    flex: none;
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 10px;
    padding: 5px 10px;
    font-size: 12px;
    line-height: 1.2;
    color: var(--color-font-label);
    background-color: var(--color-primary-light-200-alpha-900);
    border-radius: @radius-border;
    .mixin-ellipsis-1();

    :global(svg) {
      flex: none;
      color: var(--color-font-label);
    }

    .label {
      flex: none;
      color: var(--color-font-label);
    }

    .path {
      color: var(--color-link);
      cursor: pointer;
    }

    .path.invalid {
      color: var(--color-font-error);
      cursor: default;
    }

    .default {
      font-style: italic;
    }

    // 地址失效时整块标红，重设按钮不能被省略号挤掉
    &.invalid {
      :global(svg) {
        color: var(--color-font-error);
      }

      :global(.btn) {
        flex: none;
      }
    }
  }

  @media (max-width: @breakpoint-mobile) {
    .container {
      padding: 0 10px 10px;
    }

    .header {
      flex-wrap: wrap;
      gap: 6px;
      margin: 8px 0 4px;

      :global(.list) {
        overflow-x: hidden;
        gap: 8px;
        justify-content: space-between;
      }
    }

    .save-path {
      margin-bottom: 6px;
      padding: 4px 8px;
      font-size: 11px;
      gap: 4px;
    }

    .list {
      padding: 4px 0;
    }
  }
</style>
