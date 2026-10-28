<script lang="ts">
  import { CANCELED_ERROR_MSG, QUALITYS } from '@any-listen/common/constants'
  import { detectFormatFromUrl, getFileType } from '@any-listen/common/tools'

  import Btn from '@/components/base/Btn.svelte'
  import Modal from '@/components/material/Modal.svelte'
  import { i18n, t, type Message } from '@/plugins/i18n'
  import { getMusicUrl } from '@/shared/ipc/music'

  let {
    onafterleave,
  }: {
    onafterleave: () => void
  } = $props()

  let visible = $state(false)
  let musicInfo = $state<AnyListen.Music.MusicInfoOnline | null>(null)
  let qualities = $state<Array<{ quality: string; sizeStr: string | null }>>([])
  let originalQualities = $state<Array<{ quality: string; sizeStr: string | null }>>([])
  let current = $state('')
  let checkingFormat = $state(false)
  let promise: [(quality: string) => void, (error: Error) => void] | null = null
  let checkToken = 0

  const qualityLabel = (quality: string) => i18n.t(`settings.player.music_quality_${quality}` as keyof Message)

  const cancelPending = () => {
    const currentPromise = promise
    promise = null
    currentPromise?.[1](new Error(CANCELED_ERROR_MSG))
  }

  const resolvePending = (quality: string) => {
    const currentPromise = promise
    promise = null
    currentPromise?.[0](quality)
  }

  const handleCancel = () => {
    visible = false
    cancelPending()
  }

  const handleOk = () => {
    if (!current) return
    visible = false
    resolvePending(current)
  }

  /**
   * 音质选对了但音源给的字节是别的格式。别落一个打不开的 .flac 到盘上。
   * 这里预检 URL 后缀，过滤掉不匹配的音质，避免用户白下。
   */
  const checkFormatAvailability = async (info: AnyListen.Music.MusicInfoOnline, token: number) => {
    checkingFormat = true
    try {
      const results = await Promise.all(
        originalQualities.map(async (item) => {
          try {
            const urlInfo = await getMusicUrl({
              musicInfo: info,
              quality: item.quality,
            })
            const urlFormat = detectFormatFromUrl(urlInfo.url)
            const expectedFormat = getFileType(item.quality)
            // 拿不到后缀时认为匹配（无法判断，不拦截）
            return { quality: item.quality, valid: urlFormat == null || urlFormat == expectedFormat }
          } catch {
            // 拿不到 URL 视为不可用（可能真的没有这个音质）
            return { quality: item.quality, valid: false }
          }
        })
      )
      // token 变了说明弹窗被重新打开，丢弃结果
      if (token != checkToken) return
      qualities = originalQualities.filter((item) =>
        results.find((r) => r.quality == item.quality)?.valid
      )
      // 如果当前选中的音质被过滤掉了，选第一个可用的
      if (current && !qualities.some((q) => q.quality == current)) {
        current = qualities[0]?.quality ?? ''
      }
    } finally {
      checkingFormat = false
    }
  }

  export const show = async (info: AnyListen.Music.MusicInfoOnline) => {
    checkToken++
    musicInfo = info
    checkingFormat = false
    // qualitys 里存在的就是能下的音质，从高到低排
    const available: AnyListen.Music.Quality[] = [...QUALITYS].reverse()
    originalQualities = available
      .filter((quality) => !!info.meta.qualitys?.[quality])
      .map((quality) => ({ quality, sizeStr: info.meta.qualitys?.[quality]?.sizeStr ?? null }))
    qualities = originalQualities
    current = qualities[0]?.quality ?? ''
    visible = true
    // 后台预检格式，过滤掉不匹配的音质
    void checkFormatAvailability(info, checkToken)
    return new Promise<string>((resolve, reject) => {
      promise = [resolve, reject]
    })
  }

  export const hide = () => {
    handleCancel()
  }
</script>

<Modal
  bind:visible
  teleport="#root"
  minheight="0"
  bgclose={false}
  closebtn={false}
  keyclose={false}
  onafterleave={onafterleave}
>
  {#if musicInfo}
    <main class="main">
      <h2>{$t('user_list_music_menu__download_quality')}</h2>
      <p class="name">{musicInfo.singer ? `${musicInfo.name} - ${musicInfo.singer}` : musicInfo.name}</p>
      <div class="scroll content">
        {#if qualities.length}
          {#each qualities as quality (quality.quality)}
            <Btn
              class={current == quality.quality ? [] : ['outline']}
              onclick={() => {
                current = quality.quality
              }}
            >
              {qualityLabel(quality.quality)}
              {#if quality.sizeStr}
                <span class="size">{quality.sizeStr}</span>
              {/if}
            </Btn>
          {/each}
        {:else}
          <p class="empty">{$t('user_list_music_menu__download_no_quality')}</p>
        {/if}
        <div class="btns">
          <Btn outline onclick={handleCancel}>{$t('btn_cancel')}</Btn>
          <Btn disabled={!current} onclick={handleOk}>{$t('btn_confirm')}</Btn>
        </div>
      </div>
    </main>
  {/if}
</Modal>

<style lang="less">
  .main {
    display: flex;
    flex-flow: column nowrap;
    justify-content: center;
    min-width: 260px;
    max-width: 700px;
    min-height: 0;
    padding: 15px;

    h2 {
      font-size: 16px;
      line-height: 1.3;
      color: var(--color-font);
      text-align: center;
    }

    .name {
      margin-top: 5px;
      font-size: 13px;
      color: var(--color-font-label);
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .content {
    flex: auto;
    display: flex;
    flex-flow: column nowrap;
    gap: 8px;
    max-height: 50vh;
    padding: 15px 0 10px;
    padding-right: 5px;

    .empty {
      font-size: 13px;
      color: var(--color-font-label);
      text-align: center;
    }
  }

  .size {
    margin-left: 5px;
    font-size: 12px;
    color: var(--color-font-label);
  }

  .btns {
    display: flex;
    gap: 15px;
    margin-top: 10px;
    align-items: center;
    justify-content: center;
  }

  :global(.btn) {
    display: flex;
    align-items: center;
    white-space: nowrap;
  }
</style>