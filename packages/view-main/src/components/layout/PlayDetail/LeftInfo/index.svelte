<script lang="ts">
  import Cover from './Cover.svelte'
  import Info from './Info.svelte'
  // let { introend }: { introend: boolean } = $props()
</script>

<div class="left-info">
  <Cover />
  <Info />
</div>

<style lang="less">
  .left-info {
    display: flex;
    flex: none;
    flex-flow: column nowrap;
    align-items: center;
    width: 50%;
    padding: 14px 15px 14px 20px;
    contain: strict;
    // transition: flex-basis @transition-normal;

    // 注册为尺寸查询容器，让封面能用 cqh 按可用高度自适应缩放：
    // 手机横屏（视口宽 > 900px 但很矮）时封面不再撑破布局（原封面 72% 宽超过主区高度，
    // 被裁剪、并把歌曲信息块挤出视口、进度条不可见）。
    container-type: size;

    --content-width: 72%;

    @media (max-width: @breakpoint-playdetail-mobile) {
      width: 100%;
      padding: 10px 12px;
      --content-width: 88%;
    }
  }

  // 移动端沉浸式「歌词页」：把封面 + 信息拆成 Main 的直接子项，便于用 order 重排
  @media (max-width: @breakpoint-playdetail-mobile) {
    .left-info {
      display: contents;
    }
  }
</style>
