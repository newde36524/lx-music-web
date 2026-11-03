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

    --content-width: 72%;

    @media (max-width: @breakpoint-mobile) {
      width: 100%;
      padding: 10px 12px;
      --content-width: 88%;
    }
  }

  // 移动端沉浸式「歌词页」：把封面 + 信息拆成 Main 的直接子项，便于用 order 重排
  @media (max-width: @breakpoint-mobile) {
    .left-info {
      display: contents;
    }
  }
</style>
