<script lang="ts">
  import Image from '@/components/base/Image.svelte'
  import { scrollListTo } from '@/modules/app/store/action'
  import { setShowPlayDetail } from '@/modules/playDetail/store/commit'
  import { musicInfo } from '@/modules/player/reactive.svelte'
  import { playerState } from '@/modules/player/store/state'
  import { longpress } from '@/shared/browser/longpress'
  let pic = $derived($musicInfo.pic)

  // 在播放列表里定位到当前播放的歌
  const handleContextmenu = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const mInfo = playerState.playMusicInfo
    if (!mInfo) return
    scrollListTo(mInfo.listId, mInfo.source, mInfo.musicInfo)
  }
</script>

<div class="container">
  <button
    type="button"
    class="btn"
    onclick={() => {
      setShowPlayDetail(true)
    }}
    oncontextmenu={handleContextmenu}
    use:longpress={handleContextmenu}
  >
    <Image decoding="auto" loading="eager" src={pic} />
  </button>
</div>

<style lang="less">
  .container {
    flex: none;
    min-width: 0;
    // width: @height-player;
    height: 100%;
    padding: 8px 10px;

    @media (max-width: @breakpoint-mobile) {
      padding: 10px 8px;
    }
  }
  .btn {
    display: block;
    height: 100%;
    aspect-ratio: 1;
    // aspect-ratio: 1;
    padding: 0;
    cursor: pointer;
    background: none;
    border: none;
    transition: opacity @transition-fast;

    &:hover {
      opacity: 0.6;
    }
  }
</style>
