<script lang="ts">
  import LeftInfo from './LeftInfo/index.svelte'
  import RightLyric from './RightLyric/index.svelte'
  import { playDetailLyricsMode } from '@/modules/playDetail/reactive.svelte'
  import { musicInfo } from '@/modules/player/reactive.svelte'
  import { fade } from 'svelte/transition'

  let { introend }: { introend: boolean } = $props()
</script>

<div class="player-detail-main">
  <!-- 切歌时做一次简短淡入淡出过渡（key 跟随歌曲 id 变化） -->
  {#key $musicInfo?.id}
    <div class="track-layer" in:fade={{ duration: 200 }} out:fade={{ duration: 150 }}>
      <!-- 始终渲染封面（CoverSquare 内部根据纯歌词模式在「横幅」与「顶部小图标」之间做过渡动画），
           纯歌词模式下歌曲信息块由 Info 自行隐藏 -->
      <LeftInfo />
      <RightLyric {introend} />
    </div>
  {/key}
</div>

<style lang="less">
  .player-detail-main {
    position: relative;
    flex: auto;
    min-height: 0;
    overflow: hidden;
  }
  // 切歌过渡层：绝对定位铺满主区域，切换时新旧两层重叠做交叉淡化，避免布局跳动
  .track-layer {
    position: absolute;
    inset: 0;
    display: flex;
    flex-flow: row nowrap;
  }

  // 移动端上下堆叠：上面专辑信息，下面歌词
  // 注意：display:contents 与 order 分别写在 LeftInfo / RightLyric 自身的作用域里，
  // 因为 Svelte 的样式裁剪会丢弃父组件里指向子组件根节点的选择器。
  @media (max-width: @breakpoint-playdetail-mobile) {
    .track-layer {
      flex-flow: column nowrap;
    }
    .player-detail-main {
      position: relative;
      overflow: hidden;
    }
  }
</style>
