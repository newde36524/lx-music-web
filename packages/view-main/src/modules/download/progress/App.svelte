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

  const radius = 52
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = $derived(circumference * (1 - progress / 100))

  const isCompleted = $derived(status == 'completed')
  const isError = $derived(status == 'error')
  const isPreparing = $derived(status == 'preparing')
  const isDownloading = $derived(status == 'downloading')
</script>

{#if visible}
  <div class="overlay" onclick={() => {
    if (isCompleted || isError) closeDownloadProgress()
  }}>
    <div class="progress-container" transition:fly={{ y: 20, duration: 300 }} role="dialog" aria-label={fileName} onclick={(e) => e.stopPropagation()}>
      <div class="ring">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <defs>
            <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="var(--color-primary)" />
              <stop offset="100%" stop-color="var(--color-primary-light-200)" />
            </linearGradient>
          </defs>
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="var(--color-primary-light-800-alpha-900)"
            stroke-width="10"
          />
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="url(#progress-gradient)"
            stroke-width="10"
            stroke-linecap="round"
            stroke-dasharray={circumference}
            stroke-dashoffset={strokeDashoffset}
            transform="rotate(-90 70 70)"
            class="progress-circle"
          />
        </svg>
        <div class="progress-text">
          <span class="percent">{Math.round(progress)}%</span>
          {#if isPreparing}
            <SvgIcon name="audio-wave" class="status-icon" />
          {:else if isError}
            <SvgIcon name="close" class="status-icon error" />
          {/if}
        </div>
      </div>
      <p class="speed-text">{speed}</p>
      <p class="status-text">
        {#if isError}
          {i18n.t('download.browser.failed')}
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
        <Btn min outline class="action-btn" onclick={() => cancelDownloadProgress()}>
          {$t('download.action.cancel')}
        </Btn>
      {:else if isCompleted || isError}
        <Btn min outline class="action-btn" onclick={() => closeDownloadProgress()}>
          {$t('download.action.completed')}
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
    gap: 12px;
    padding: 28px 36px;
    min-width: 260px;
    background: var(--color-content-background);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgb(0 0 0 / 25%);
  }

  .ring {
    position: relative;
    width: 140px;
    height: 140px;
  }

  .ring svg {
    width: 100%;
    height: 100%;
  }

  .progress-circle {
    transition: stroke-dashoffset 0.3s ease-out;
  }

  .progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 100%;
    height: 100%;
    text-align: center;
  }

  .status-icon {
    width: 28px;
    height: 28px;
    color: var(--color-primary);

    &.error {
      color: var(--color-primary-dark-100);
    }
  }

  .percent {
    font-size: 28px;
    font-weight: 700;
    color: var(--color-primary);
    line-height: 1.2;
  }

  .speed-text {
    margin: 0;
    font-size: 13px;
    color: var(--color-font-label);
    text-align: center;
    min-height: 20px;
  }

  .status-text {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-font);
    text-align: center;
    min-height: 20px;
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

  :global(.btn.action-btn) {
    border: 1px solid var(--color-primary-light-300) !important;
    min-width: 88px;
    padding: 6px 16px !important;
    justify-content: center !important;
    text-align: center !important;
    display: inline-flex !important;
    align-items: center !important;
  }
</style>
