<script lang="ts">
  import { musicInfo, quality } from '@/modules/player/reactive.svelte'
  import { playDetailLyricsMode } from '@/modules/playDetail/reactive.svelte'
  import { t, type Message } from '@/plugins/i18n'
  import { QUALITYS_BEST_FIRST } from '@/modules/player/utils/quality'
  import { onMount } from 'svelte'
  import { MEDIA_QUERY_MOBILE } from '@/shared/browser/mobile'

  const qualityLabel = $derived($quality ? $t(`settings.player.music_quality_${$quality}` as keyof Message) : '')

  // 移动端：效果图在歌手名右侧显示「多个音质标签」。本项目歌曲数据没有酷我的
  // 原唱/3D丽音/伴唱/视频 格式标志，这里用歌曲「真实可用的音质」做成多标签行
  // （128K/320K/FLAC/母带 等，当前播放的音质高亮）。
  let isMobile = $state(false)
  onMount(() => {
    const mq = window.matchMedia(MEDIA_QUERY_MOBILE)
    const update = () => {
      isMobile = mq.matches
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  })
  const availableQualities = $derived.by(() => {
    const list: AnyListen.Music.Quality[] = []
    const info = $musicInfo
    if (!info || info.isLocal) return list
    // 歌曲真实可用的音质（meta.qualitys 里为真的项，最佳优先）
    // 注意：部分源的 meta 运行时可能缺 qualitys（如酷狗歌只有 ext/bitrateLabel），要防护。
    const qualitys = info.meta?.qualitys
    for (const q of QUALITYS_BEST_FIRST) if (qualitys?.[q]) list.push(q)
    // 当前播放音质恒显示（即使 meta.qualitys 为空）
    if ($quality && !list.includes($quality)) list.unshift($quality)
    return list
  })
</script>

<!-- 纯歌词模式下隐藏歌曲信息块（只保留顶部居中的小封面图标） -->
<div class="scroll info" class:lyrics-mode={playDetailLyricsMode.value}>
  <p class="i-name"><span>{$t('play_detail.music_name')}</span>{$musicInfo.name}</p>
  <div class="i-artist">
    <p class="i-singer"><span>{$t('play_detail.music_singer')}</span>{$musicInfo.singer}</p>
    {#if isMobile}
      {#if availableQualities.length}
        <p class="i-quality">
          {#each availableQualities as q (q)}
            <span class="q-tag" class:active={q === $quality}>
              {$t(`settings.player.music_quality_${q}` as keyof Message)}
            </span>
          {/each}
        </p>
      {/if}
    {:else if qualityLabel}
      <p class="i-quality"><span>{$t('play_detail.music_quality')}</span>{qualityLabel}</p>
    {/if}
  </div>
  {#if $musicInfo.album}
    <p class="i-album"><span>{$t('play_detail.music_album')}</span>{$musicInfo.album}</p>
  {/if}
</div>

<style lang="less">
  .info {
    flex: auto;
    width: var(--content-width);
    // padding-bottom: 15px;
    min-height: 0;
    margin-top: 15px;
    p {
      font-size: 16px;
      line-height: 1.5;
      overflow-wrap: break-word;

      span {
        font-size: 14px;
        color: var(--color-font-label);
      }
    }
  }

  // 移动端沉浸式「歌词页」：歌曲信息块落到进度条上方，标题放大、歌手次之、音质做成胶囊标签
  @media (max-width: @breakpoint-mobile) {
    // 纯歌词模式下隐藏歌曲信息块
    .info.lyrics-mode {
      display: none;
    }
    .info {
      order: 3;
      flex: none;
      width: 100%;
      min-height: 0;
      margin: 0;
      padding: 14px 20px 6px;
      overflow: visible;

      .i-name {
        font-size: 22px;
        font-weight: 600;
        line-height: 1.3;
        // 背景是高斯模糊封面（叠暗色罩，偏深），歌曲名用白色（参照效果图）
        color: #fff;
        span {
          display: none;
        }
      }
      // 歌手名 + 音质标签同一行（音质标签移到作者右侧、缩小显示，参照效果图）
      .i-artist {
        display: flex;
        flex-flow: row nowrap;
        align-items: center;
        gap: 8px;
        margin-top: 4px;

        .i-singer {
          margin-top: 0;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.65);
          span {
            display: none;
          }
        }
        // 效果图：歌手名右侧的「多个音质标签」——中性描边胶囊，当前播放音质稍亮。
        // 注意：效果图里的 原唱/3D丽音/伴唱/视频 是酷我格式标志，本项目歌曲数据没有，
        // 这里展示歌曲真实可用的音质（128K/320K/FLAC/母带等）。
        .i-quality {
          display: flex;
          flex: none;
          flex-flow: row wrap;
          align-items: center;
          gap: 6px;
          margin-top: 0;

          .q-tag {
            padding: 2px 9px;
            font-size: 10px;
            line-height: 1.5;
            color: rgba(255, 255, 255, 0.65);
            background-color: transparent;
            border: 1px solid rgba(255, 255, 255, 0.28);
            border-radius: 999px;

            &.active {
              color: #fff;
              background-color: rgba(255, 255, 255, 0.12);
              border-color: rgba(255, 255, 255, 0.45);
            }
          }
        }
      }
      .i-album {
        display: none;
      }
    }
  }
</style>
