<script lang="ts">
  import Btn from '@/components/base/Btn.svelte'
  import { showNotify } from '@/components/apis/notify'
  import { i18n, t } from '@/plugins/i18n'
  import { canBrowserDownload, getBrowserDirInfo, pickBrowserDownloadDir } from '@/modules/download/browser'
  import { getDownloadSavePathStatus } from '@/modules/download'
  import { updateSetting } from '@/modules/setting/store/action'
  import { useSettingValue } from '@/modules/setting/reactive.svelte'
  import { openDirInExplorer, showOpenDialog } from '@/shared/ipc/app'
  import { showFileSelectModal } from '@/shared/ipc/fs/fileSelectModal'

  import TitleContent from '../components/TitleContent.svelte'

  const savePath = useSettingValue('download.savePath')

  // 浏览器直存只有 web + 新版 Chromium 能用，这里算一次就够
  const browserSupported = canBrowserDownload()
  // web 端没有原生文件夹选择框，showOpenDialog 在 web-server 的 IPC 里被去掉了
  const pickDir = import.meta.env.VITE_IS_WEB ? showFileSelectModal : showOpenDialog
  const canOpenDir = import.meta.env.VITE_IS_DESKTOP

  let dirInfo = $state<{ name: string; granted: boolean }>({ name: '', granted: false })

  // 配好的地址可能已经不存在了：换台设备连同一个服务、或者目录被删掉。
  // IPC 没连上的时候 getDownloadSavePathStatus 返回 valid，不会误报
  let serverPathExists = $state(true)
  $effect(() => {
    const path = savePath.val
    void getDownloadSavePathStatus().then((status) => {
      if (path != savePath.val) return
      serverPathExists = status.valid
    })
  })

  const refreshDirInfo = async () => {
    if (!browserSupported) return
    dirInfo = await getBrowserDirInfo()
  }
  void refreshDirInfo()

  const handleSelectPath = async () => {
    const result = await pickDir({
      title: i18n.t('settings.download.save_dir'),
      properties: ['openDirectory'],
    })
    if (result.canceled) return
    const path = result.filePaths[0]
    if (!path) return
    await updateSetting({ 'download.savePath': path })
  }

  const handleOpenPath = () => {
    if (!savePath.val) return
    void openDirInExplorer(savePath.val)
  }

  // 必须点着按钮选，浏览器的目录授权只能在用户手势里拿
  const handlePickBrowserDir = async () => {
    const dir = await pickBrowserDownloadDir()
    await refreshDirInfo()
    if (dir) return
    // 用户取消和浏览器拒绝选系统文件夹都抛 NotAllowedError，区分不出来，给一句通用指引
    showNotify(i18n.t('download.browser.pick_dir_failed'))
  }
</script>

{#if browserSupported}
  <TitleContent name={$t('settings.download.browser_dir')} desc={$t('settings.download.mode_browser_tip')}>
    <div class="settings-item-content">
      {#if dirInfo.name}
        <p class="auto-hidden">
          <span class="dir-name" role="presentation" aria-label={dirInfo.name}>{dirInfo.name}</span>
        </p>
        {#if dirInfo.granted}
          <p class="tip ok">{$t('settings.download.browser_dir_granted')}</p>
        {:else}
          <p class="tip warn">{$t('settings.download.browser_dir_no_permission')}</p>
        {/if}
      {:else}
        <p class="tip">{$t('settings.download.browser_dir_default')}</p>
      {/if}
      <div class="btns">
        <Btn min onclick={handlePickBrowserDir}>{$t('download.browser.pick_dir')}</Btn>
      </div>
    </div>
  </TitleContent>
{:else}
  <TitleContent name={$t('settings.download.save_path')} desc={$t('settings.download.save_path_desc')}>
    <div class="settings-item-content">
      {#if savePath.val}
        <p class="auto-hidden">
          <span class="save-path" role="presentation" aria-label={savePath.val} onclick={canOpenDir ? handleOpenPath : undefined}>
            {savePath.val}
          </span>
        </p>
      {:else}
        <p class="tip">{$t('settings.download.save_path_default')}</p>
      {/if}
      <div class="btns">
        <Btn min onclick={handleSelectPath}>{$t('settings.download.change_dir')}</Btn>
        {#if savePath.val}
          <Btn min onclick={() => void updateSetting({ 'download.savePath': '' })}>
            {$t('settings.download.reset_dir')}
          </Btn>
        {/if}
      </div>
      {#if savePath.val && !serverPathExists}
        <p class="tip warn">{$t('settings.download.save_path_invalid')}</p>
      {/if}
      {#if import.meta.env.VITE_IS_WEB}
        <p class="tip">{$t('settings.download.save_path_web_tip')}</p>
      {/if}
    </div>
  </TitleContent>
{/if}

<style lang="less">
  .settings-item-content {
    display: flex;
    flex-flow: column nowrap;
    gap: 8px;
  }

  .save-path,
  .dir-name {
    cursor: pointer;
    font-size: 13px;
    color: var(--color-link);
  }

  .btns {
    display: flex;
    gap: 8px;
  }

  .tip {
    font-size: 13px;
    font-style: italic;
    color: var(--color-font-label);
  }

  .tip.ok {
    color: var(--color-btn-min);
  }

  .tip.warn {
    color: var(--color-font-error);
  }
</style>
