<script lang="ts">
  import { fly } from 'svelte/transition'
  import Btn from '@/components/base/Btn.svelte'
  import SvgIcon from '@/components/base/SvgIcon.svelte'
  import { i18n, t } from '@/plugins/i18n'
  import { cancelDownloadProgress, closeDownloadProgress } from './store.svelte'

  let {
    visible,
    status,
    progress,
    speed,
    fileName,
    errorMessage,
    blobUrl,
  } = $props<{
    visible: boolean
    status: 'preparing' | 'downloading' | 'completed' | 'error'
    progress: number
    speed: string
    fileName: string
    errorMessage: string
    blobUrl: string
  }>()

  const radius = 45
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - progress / 100)

  const isCompleted = $derived(status == 'completed')
  const isError = $derived(status == 'error')
  const isPreparing = $derived(status == 'preparing')
  const isDownloading = $derived(status == 'downloading')

  const getStatusText = () => {
    if (isPreparing) return i18n.t('download.browser.preparing')
    if (isCompleted) return i18n.t('download.browser.completed')
    if (isError) return i18n.t('download.browser.failed')
    return i18n.t('download.browser.downloading', { name: fileName })
  }
</script>

{#if visible}
  <div class="overlay" onclick={() => {
    // 点击空白部分关闭（仅在完成或出错时）
    if (isCompleted || isError) closeDownloadProgress()
  }}>
    <div class="progress-container" transition:fly={{ y: 20, duration: 300 }} role="dialog" aria-label={getStatusText()} onclick={(e) => e.stopPropagation()}>
      <div class="ring">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="var(--color-primary-light-200-alpha-900)"
            stroke-width="8"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={isError ? 'var(--color-error)' : 'var(--color-primary)'}
            stroke-width="8"
            stroke-linecap="round"
            stroke-dasharray={circumference}
            stroke-dashoffset={strokeDashoffset}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div class="progress-text">
          {#if isPreparing}
            <SvgIcon name="clock" class="status-icon" />
          {:else if isCompleted}
            <SvgIcon name="check-true" class="status-icon success" />
          {:else if isError}
            <SvgIcon name="warning" class="status-icon error" />
          {:else}
            <span class="percent">{Math.round(progress)}%</span>
            {#if speed}<span class="speed">{speed}</span>{/if}
          {/if}
        </div>
      </div>
      <p class="status-text">
        {#if isError}
          {i18n.t('download.browser.download_failed', { name: fileName })}
          {#if errorMessage}<span class="error-msg">{errorMessage}</span>{/if}
        {:else if isCompleted}
          {i18n.t('download.browser.completed')}
        {:else if isPreparing}
          {i18n.t('download.browser.preparing')}
        {:else}
          {i18n.t('download.browser.downloading', { name: fileName })}
        {/if}
      </p>
      <p class="file-name" data-ignore-tip title={fileName}>{fileName}</p>
      {#if isDownloading}
        <Btn min outline onclick={() => cancelDownloadProgress()}>
          <SvgIcon name="cancel" />{$t('download.action.cancel')}
        </Btn>
      {:else}
        <Btn min outline onclick={() => closeDownloadProgress()}>
          <SvgIcon name="cancel" />{$t('download.action.close')}
        </Btn>
      {/if}
    </div>
  </div>
{/if}

<style lang="less">
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
  }

  .progress-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 24px 32px;
    min-width: 240px;
    background: var(--color-content-background);
    border-radius: @radius-border;
    box-shadow: 0 4px 12px rgb(0 0 0 / 20%);
  }

  .ring {
    position: relative;
    width: 120px;
    height: 120px;
  }

  .ring svg {
    width: 100%;
    height: 100%;
  }

  .progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
    text-align: center;
  }

  .status-icon {
    width: 32px;
    height: 32px;
    color: var(--color-primary);

    &.success {
      color: var(--color-btn-min);
    }

    &.error {
      color: var(--color-error);
    }
  }

  .percent {
    font-size: 24px;
    font-weight: 600;
    color: var(--color-primary);
  }

  .speed {
    font-size: 12px;
    color: var(--color-font-label);
  }

  .status-text {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-font);
    text-align: center;
    min-height: 20px;
  }

  .error-msg {
    display: block;
    font-size: 12px;
    color: var(--color-error);
    margin-top: 4px;
  }

  .file-name {
    max-width: 240px;
    margin: 0;
    font-size: 13px;
    color: var(--color-font-label);
    text-align: center;
    .mixin-ellipsis-1();
    min-height: 18px;
  }
</style>
