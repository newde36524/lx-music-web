<script lang="ts">
  import { lyricLine, lyricLines } from '@/modules/lyric/reactive.svelte'
  import { musicInfo, playerPlaying, quality, statusText } from '@/modules/player/reactive.svelte'
  import { useSettingValue } from '@/modules/setting/reactive.svelte'
  import { buildMusicName } from '@any-listen/common/tools'
  import { t, type Message } from '@/plugins/i18n'
  let nameFormat = useSettingValue('download.fileName')

  let status = $derived($playerPlaying && $lyricLines.length ? $lyricLine.text : $statusText)
  let musicLabel = $derived.by(() => {
    const info = $musicInfo
    if (!info.id) return ''
    return buildMusicName(nameFormat.val, info.name, info.singer)
  })
  let qualityLabel = $derived($quality ? $t(`settings.player.music_quality_${$quality}` as keyof Message) : '')
</script>

<div class="container">
  <p class="name">
    {musicLabel}
    {#if qualityLabel}<span class="quality">{qualityLabel}</span>{/if}
  </p>
  <p class="status-text">{status}</p>
</div>

<style lang="less">
  .container {
    flex: auto;
    min-width: 0;
    contain: content;
  }
  .name {
    padding: 3px 0;
    font-size: 14px;
    color: var(--color-font-label);
    .mixin-ellipsis-1();

    .quality {
      margin-left: 6px;
      font-size: 11px;
      color: var(--color-primary);
      border: 1px solid var(--color-primary-alpha-700);
      border-radius: @radius-border;
      padding: 0 4px;
      vertical-align: middle;
    }
  }

  .status-text {
    box-sizing: content-box;
    height: 18px;
    padding-bottom: 3px;
    font-size: 15px;
    .mixin-ellipsis-1();
  }
</style>
